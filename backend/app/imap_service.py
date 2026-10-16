from __future__ import annotations

from dataclasses import dataclass
from email import policy
from email.header import decode_header, make_header
from email.message import Message
from email.parser import BytesParser
from email.utils import getaddresses, parsedate_to_datetime
import base64
import html
import imaplib
import ipaddress
import re
import socket
import ssl
from typing import Any
from urllib.parse import quote, unquote

from .config import settings
from .imap_storage import ImapStorage


POLICY_TERMS = re.compile(r"\b(p[oó]liza|seguro|asegurad|insurance|cobertura|renovaci[oó]n)\b", re.I)
MAX_MESSAGE_BYTES = 25 * 1024 * 1024
MAX_LIST_MESSAGES = 50


class ImapError(RuntimeError):
    pass


@dataclass(frozen=True)
class ImapMessageRef:
    account_id: str
    uid_validity: str
    uid: str
    folder: str


def decode_header_value(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except (TypeError, ValueError):
        return value


def decode_payload(part: Message) -> str:
    payload = part.get_payload(decode=True)
    if not isinstance(payload, bytes):
        value = part.get_payload()
        return value if isinstance(value, str) else ""
    charset = part.get_content_charset() or "utf-8"
    try:
        return payload.decode(charset, errors="replace")
    except (LookupError, UnicodeError):
        return payload.decode("utf-8", errors="replace")


def sanitize_html(value: str) -> str:
    value = re.sub(r"<!--.*?-->", "", value, flags=re.S)
    value = re.sub(
        r"<\s*(script|style|iframe|object|embed|form|base)[^>]*>.*?<\s*/\s*\1\s*>",
        "",
        value,
        flags=re.I | re.S,
    )
    value = re.sub(r"\s+on[a-z]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", "", value, flags=re.I)
    return re.sub(r"(href|src)\s*=\s*(['\"])\s*javascript:[^'\"]*\2", r"\1=\2#\2", value, flags=re.I)


def plain_preview(value: str) -> str:
    text = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()[:220]


def _bytes_from_fetch(data: list[Any] | tuple[Any, ...] | None) -> bytes:
    if not data:
        return b""
    return b"".join(item[1] for item in data if isinstance(item, tuple) and len(item) > 1 and isinstance(item[1], bytes))


def _flags_from_fetch(data: list[Any] | tuple[Any, ...] | None) -> str:
    for item in data or []:
        if isinstance(item, tuple) and item and isinstance(item[0], bytes):
            match = re.search(rb"FLAGS \(([^)]*)\)", item[0])
            if match:
                return match.group(1).decode("ascii", errors="ignore")
    return ""


def _size_from_fetch(data: list[Any] | tuple[Any, ...] | None) -> int:
    for item in data or []:
        value = item[0] if isinstance(item, tuple) and item else item
        if isinstance(value, bytes):
            match = re.search(rb"RFC822\.SIZE (\d+)", value)
            if match:
                return int(match.group(1))
    return 0


def quote_imap_folder(value: str) -> str:
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


class ImapService:
    def __init__(self, storage: ImapStorage) -> None:
        self.storage = storage

    @staticmethod
    def _allowed_hosts() -> set[str]:
        return set(settings.imap_allowed_hosts)

    def validate_config(self, account: dict[str, Any]) -> None:
        host = str(account.get("host", "")).strip().lower().rstrip(".")
        if not host or len(host) > 253 or any(char.isspace() for char in host):
            raise ImapError("El servidor IMAP no es válido")
        if "://" in host or "/" in host or "@" in host:
            raise ImapError("El servidor IMAP debe ser un nombre de host, no una URL")
        security = account.get("security")
        if security not in {"ssl", "starttls", "none"}:
            raise ImapError("La seguridad IMAP no es válida")
        try:
            port = int(account.get("port", 0))
        except (TypeError, ValueError) as error:
            raise ImapError("El puerto IMAP no es válido") from error
        if not 1 <= port <= 65535:
            raise ImapError("El puerto IMAP no es válido")
        if account.get("authMethod", "password") != "password":
            raise ImapError("OAuth IMAP todavía no está habilitado")

        try:
            addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        except socket.gaierror as error:
            raise ImapError("No se pudo resolver el servidor IMAP") from error
        if not addresses:
            raise ImapError("El servidor IMAP no tiene direcciones disponibles")

        allowed = host in self._allowed_hosts()
        resolved_ips = {ipaddress.ip_address(address[4][0]) for address in addresses}
        for address in resolved_ips:
            restricted = address.is_private or address.is_loopback or address.is_link_local or address.is_reserved or address.is_multicast
            if restricted and not allowed:
                if security == "none" and address.is_loopback and settings.imap_allow_insecure_local:
                    continue
                raise ImapError("El servidor IMAP apunta a una red privada no autorizada")
        if security == "none":
            if not settings.imap_allow_insecure_local or not resolved_ips or not all(address.is_loopback for address in resolved_ips):
                raise ImapError("IMAP sin cifrado solo está permitido en loopback y en modo local explícito")

    def connect(self, account: dict[str, Any]) -> imaplib.IMAP4:
        self.validate_config(account)
        host = account["host"]
        port = int(account["port"])
        security = account["security"]
        try:
            if security == "ssl":
                connection: imaplib.IMAP4 = imaplib.IMAP4_SSL(
                    host,
                    port,
                    ssl_context=ssl.create_default_context(),
                    timeout=settings.imap_timeout_seconds,
                )
            else:
                connection = imaplib.IMAP4(host, port, timeout=settings.imap_timeout_seconds)
                if security == "starttls":
                    connection.starttls(ssl_context=ssl.create_default_context())
            connection.login(account["username"], account["password"])
            return connection
        except (OSError, imaplib.IMAP4.error, ssl.SSLError, TimeoutError) as error:
            try:
                connection.logout()  # type: ignore[has-type]
            except (UnboundLocalError, OSError, imaplib.IMAP4.error):
                pass
            raise ImapError("No fue posible autenticar la cuenta IMAP") from error

    @staticmethod
    def disconnect(connection: imaplib.IMAP4) -> None:
        try:
            connection.logout()
        except (OSError, imaplib.IMAP4.error):
            pass

    def test_connection(self, account: dict[str, Any]) -> list[str]:
        connection = self.connect(account)
        try:
            return self.list_folders(connection)
        finally:
            self.disconnect(connection)

    @staticmethod
    def list_folders(connection: imaplib.IMAP4) -> list[str]:
        status, data = connection.list()
        if status != "OK":
            raise ImapError("No se pudieron listar las carpetas IMAP")
        folders: list[str] = []
        for item in data or []:
            if not isinstance(item, bytes):
                continue
            decoded = item.decode("utf-8", errors="replace")
            match = re.match(r"^\(([^)]*)\)\s+(?:\"(?:[^\"\\]|\\.)*\"|NIL)\s+(.+)$", decoded)
            if match:
                if "\\Noselect" in match.group(1):
                    continue
                folder = match.group(2).strip()
                if folder.startswith('"') and folder.endswith('"'):
                    folder = folder[1:-1].replace('\\"', '"').replace('\\\\', '\\')
                try:
                    folder = imaplib.IMAP4._mode_utf7_decode(folder)
                except (AttributeError, UnicodeError):
                    pass
                if folder and folder not in folders:
                    folders.append(folder)
        return folders or ["INBOX"]

    @staticmethod
    def _uid_validity(connection: imaplib.IMAP4) -> str:
        response = connection.response("UIDVALIDITY")
        if response and len(response) > 1 and response[1]:
            value = response[1][0] if isinstance(response[1], list) else response[1]
            if isinstance(value, bytes):
                return value.decode("ascii", errors="ignore")
        return "0"

    @staticmethod
    def _message_id(account_id: str, folder: str, uid_validity: str, uid: str) -> str:
        encoded_folder = base64.urlsafe_b64encode(folder.encode("utf-8")).decode("ascii").rstrip("=")
        return f"{account_id}.{uid_validity}.{uid}.{encoded_folder}"

    @staticmethod
    def _parse_message_id(value: str) -> ImapMessageRef:
        parts = value.split(".", 3)
        if len(parts) != 4:
            raise ImapError("Identificador de mensaje IMAP no válido")
        try:
            folder = base64.urlsafe_b64decode(parts[3] + "===").decode("utf-8")
        except (ValueError, UnicodeDecodeError) as error:
            raise ImapError("Identificador de mensaje IMAP no válido") from error
        if not all(re.fullmatch(r"[A-Za-z0-9_-]+", item) for item in parts[:3]):
            raise ImapError("Identificador de mensaje IMAP no válido")
        return ImapMessageRef(parts[0], parts[1], parts[2], folder)

    def _select(self, connection: imaplib.IMAP4, folder: str) -> str:
        if not folder or len(folder) > 200 or any(char in folder for char in "\r\n"):
            raise ImapError("Carpeta IMAP no válida")
        status, _ = connection.select(quote_imap_folder(folder), readonly=True)
        if status != "OK":
            raise ImapError("No se pudo abrir la carpeta IMAP")
        return self._uid_validity(connection)

    def list_messages(self, account: dict[str, Any], folder: str, limit: int = MAX_LIST_MESSAGES) -> list[dict[str, Any]]:
        connection = self.connect(account)
        try:
            uid_validity = self._select(connection, folder)
            status, data = connection.uid("search", None, "ALL")
            if status != "OK":
                raise ImapError("No se pudieron buscar mensajes IMAP")
            uids = (data[0] if data else b"").split()[-max(1, min(limit, MAX_LIST_MESSAGES)):]
            result: list[dict[str, Any]] = []
            for raw_uid in reversed(uids):
                uid = raw_uid.decode("ascii", errors="ignore")
                result.append(self._fetch_normalized(connection, account, folder, uid_validity, uid, full=False))
            return result
        finally:
            self.disconnect(connection)

    def get_message(self, account: dict[str, Any], message_id: str) -> dict[str, Any]:
        reference = self._parse_message_id(message_id)
        if reference.account_id != account["id"]:
            raise ImapError("El mensaje no pertenece a la cuenta IMAP")
        connection = self.connect(account)
        try:
            uid_validity = self._select(connection, reference.folder)
            if uid_validity != reference.uid_validity:
                raise ImapError("La carpeta IMAP cambió de versión; actualiza la bandeja")
            status, size_data = connection.uid("fetch", reference.uid, "(RFC822.SIZE)")
            if status != "OK" or _size_from_fetch(size_data) > MAX_MESSAGE_BYTES:
                raise ImapError("El mensaje IMAP supera el límite permitido")
            return self._fetch_normalized(connection, account, reference.folder, uid_validity, reference.uid, full=True)
        finally:
            self.disconnect(connection)

    def download_attachment(self, account: dict[str, Any], message_id: str, attachment_id: str) -> tuple[bytes, str, str]:
        message = self.get_message(account, message_id)
        reference = self._parse_message_id(message_id)
        connection = self.connect(account)
        try:
            self._select(connection, reference.folder)
            status, data = connection.uid("fetch", reference.uid, "(RFC822)")
            if status != "OK":
                raise ImapError("No se pudo recuperar el mensaje IMAP")
            raw = _bytes_from_fetch(data)
            if len(raw) > MAX_MESSAGE_BYTES:
                raise ImapError("El mensaje IMAP supera el límite permitido")
            parsed = BytesParser(policy=policy.default).parsebytes(raw)
            part = next((item for item in self._parts(parsed) if item[0] == attachment_id), None)
            if part is None:
                raise ImapError("El adjunto no existe en el mensaje")
            _, mime_part = part
            content = mime_part.get_payload(decode=True)
            if not isinstance(content, bytes):
                raise ImapError("El adjunto IMAP está vacío")
            filename = decode_header_value(mime_part.get_filename()) or "adjunto"
            return content, filename, mime_part.get_content_type()
        finally:
            self.disconnect(connection)

    def _fetch_normalized(
        self,
        connection: imaplib.IMAP4,
        account: dict[str, Any],
        folder: str,
        uid_validity: str,
        uid: str,
        *,
        full: bool,
    ) -> dict[str, Any]:
        query = "(RFC822)" if full else "(RFC822.SIZE FLAGS BODY.PEEK[HEADER] BODY.PEEK[TEXT]<0.2048>)"
        status, data = connection.uid("fetch", uid, query)
        if status != "OK":
            raise ImapError("No se pudo leer el mensaje IMAP")
        size = _size_from_fetch(data)
        raw = _bytes_from_fetch(data)
        if full and len(raw) > MAX_MESSAGE_BYTES:
            raise ImapError("El mensaje IMAP supera el límite permitido")
        parsed = BytesParser(policy=policy.default).parsebytes(raw)
        message_id = self._message_id(account["id"], folder, uid_validity, uid)
        return self._normalize_message(parsed, account, folder, message_id, uid, size or len(raw), _flags_from_fetch(data))

    def _normalize_message(
        self,
        message: Message,
        account: dict[str, Any],
        folder: str,
        message_id: str,
        uid: str,
        size: int,
        flags: str,
    ) -> dict[str, Any]:
        plain = ""
        html_body = ""
        for part in message.walk() if message.is_multipart() else [message]:
            if part.get_content_disposition() == "attachment":
                continue
            content_type = part.get_content_type()
            value = decode_payload(part)
            if content_type == "text/plain" and not plain:
                plain = value
            elif content_type == "text/html" and not html_body:
                html_body = value
        body = plain or plain_preview(html_body)
        sender_name, sender_email = next(iter(getaddresses([decode_header_value(message.get("From"))])), ("", ""))
        sender_name = sender_name or sender_email or "Remitente desconocido"
        received = decode_header_value(message.get("Date"))
        try:
            received_at = parsedate_to_datetime(received).isoformat()
        except (TypeError, ValueError, OverflowError):
            received_at = received or ""
        attachments, inline_resources = self._attachment_responses(message, message_id)
        all_text = " ".join([decode_header_value(message.get("Subject")), body, *(item["name"] for item in attachments)])
        is_policy = bool(POLICY_TERMS.search(all_text))
        to = self._addresses(message.get_all("To", []))
        cc = self._addresses(message.get_all("Cc", []))
        return {
            "id": message_id,
            "accountId": account["id"],
            "accountName": account["label"],
            "folder": folder,
            "sender": sender_name,
            "senderEmail": sender_email,
            "subject": decode_header_value(message.get("Subject")) or "(Sin asunto)",
            "body": body,
            "bodyHtml": sanitize_html(html_body) if html_body else None,
            "preview": plain_preview(body or html_body),
            "receivedAt": received_at,
            "unread": "\\Seen" not in flags,
            "mailbox": folder,
            "receivedLabel": received_at,
            "labels": flags.split(),
            "to": to,
            "cc": cc,
            "hasAttachments": bool(attachments),
            "inlineResources": inline_resources,
            "policyType": "Póliza" if is_policy else "Documento",
            "isPolicyRelated": is_policy,
            "size": size,
            "attachments": attachments,
        }

    @staticmethod
    def _addresses(values: list[str]) -> list[dict[str, str]]:
        return [{"name": decode_header_value(name), "email": email} for name, email in getaddresses(values) if email]

    @staticmethod
    def _parts(message: Message) -> list[tuple[str, Message]]:
        return [(f"part-{index}", part) for index, part in enumerate(message.walk(), start=1) if not part.is_multipart()]

    def _attachment_responses(self, message: Message, message_id: str) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
        attachments: list[dict[str, Any]] = []
        inline_resources: list[dict[str, str]] = []
        for part_id, part in self._parts(message):
            filename = decode_header_value(part.get_filename())
            content_id = (part.get("Content-ID") or "").strip().strip("<>")
            disposition = part.get_content_disposition()
            if not filename and disposition != "attachment" and not content_id:
                continue
            content = part.get_payload(decode=True)
            size = len(content) if isinstance(content, bytes) else 0
            mime_type = part.get_content_type()
            is_pdf = mime_type == "application/pdf" or filename.lower().endswith(".pdf")
            is_image = mime_type.startswith("image/")
            account_id = message_id.split(".", 1)[0]
            url = f"/api/imap/attachments/{quote(message_id, safe='')}/{quote(part_id, safe='')}?account_id={quote(account_id, safe='')}"
            if content_id and is_image:
                inline_resources.append({"contentId": content_id, "attachmentId": part_id, "mimeType": mime_type, "url": url})
            if filename or disposition == "attachment":
                attachments.append({
                    "id": part_id,
                    "name": filename or f"adjunto-{part_id}",
                    "type": "pdf" if is_pdf else ("image" if is_image else "file"),
                    "mimeType": mime_type,
                    "size": size,
                    "sizeKb": round(size / 1024),
                    "isPdf": is_pdf,
                    "isImage": is_image,
                    "isPreviewable": is_pdf or is_image,
                    "downloadUrl": f"{url}&download=true",
                    "previewUrl": url if is_pdf or is_image else None,
                })
        return attachments, inline_resources
