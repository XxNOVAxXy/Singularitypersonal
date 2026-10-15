from __future__ import annotations

import base64
from dataclasses import dataclass
from email.header import decode_header, make_header
from email.utils import getaddresses, parseaddr, parsedate_to_datetime
import hashlib
import html
import re
import secrets
from typing import Any

from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from .config import settings
from .storage import GmailStorage


GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly"
POLICY_TERMS = re.compile(r"\b(p[oó]liza|seguro|asegurad|insurance|cobertura|renovaci[oó]n)\b", re.I)
IMAGE_MIMES = {"image/jpeg", "image/png", "image/gif", "image/webp"}


@dataclass
class GmailAttachment:
    id: str
    name: str
    size: int
    mime_type: str
    is_pdf: bool
    fingerprint: str
    inline_data: str | None = None
    content_id: str | None = None
    part_id: str = ""


def _decode_text(value: str | None) -> str:
    if not value:
        return ""
    try:
        return base64.urlsafe_b64decode(value + "===").decode("utf-8", errors="replace")
    except (ValueError, base64.binascii.Error):
        return ""


def _decode_bytes(value: str | None) -> bytes:
    if not value:
        return b""
    try:
        return base64.urlsafe_b64decode(value + "===")
    except (ValueError, base64.binascii.Error):
        return b""


def _decode_header(value: str | None) -> str:
    if not value:
        return ""
    try:
        return str(make_header(decode_header(value)))
    except (TypeError, ValueError):
        return value


def _plain_text(value: str) -> str:
    value = re.sub(r"<style[^>]*>.*?</style>|<script[^>]*>.*?</script>", " ", value, flags=re.I | re.S)
    value = re.sub(r"<[^>]+>", " ", value)
    return re.sub(r"\s+", " ", html.unescape(value)).strip()


def _sanitize_html(value: str) -> str:
    value = re.sub(r"<!--.*?-->", "", value, flags=re.S)
    value = re.sub(r"<\s*(script|style|iframe|object|embed|form|base)[^>]*>.*?<\s*/\s*\1\s*>", "", value, flags=re.I | re.S)
    value = re.sub(r"\s+on[a-z]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s>]+)", "", value, flags=re.I)
    return re.sub(r"(href|src)\s*=\s*(['\"])\s*javascript:[^'\"]*\2", r"\1=\2#\2", value, flags=re.I)


def generate_pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


class GmailClient:
    def __init__(self, storage: GmailStorage) -> None:
        self.storage = storage

    def _client_config(self) -> dict[str, Any]:
        settings.require_google_oauth()
        return {"web": {"client_id": settings.google_client_id,
                         "client_secret": settings.google_client_secret,
                         "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                         "token_uri": "https://oauth2.googleapis.com/token",
                         "redirect_uris": [settings.google_redirect_uri]}}

    def authorization_url(self, state: str, verifier: str, challenge: str) -> str:
        flow = Flow.from_client_config(self._client_config(), scopes=[GMAIL_SCOPE], state=state,
                                       code_verifier=verifier, autogenerate_code_verifier=False)
        flow.redirect_uri = settings.google_redirect_uri
        url, _ = flow.authorization_url(access_type="offline", include_granted_scopes="true",
                                         prompt="consent", code_challenge=challenge,
                                         code_challenge_method="S256")
        return url

    def finish_authorization(self, code: str, state: str, verifier: str) -> None:
        flow = Flow.from_client_config(self._client_config(), scopes=[GMAIL_SCOPE], state=state,
                                       code_verifier=verifier, autogenerate_code_verifier=False)
        flow.redirect_uri = settings.google_redirect_uri
        flow.fetch_token(code=code, code_verifier=verifier)
        self.storage.save_credentials(flow.credentials)

    def credentials(self) -> Credentials | None:
        data = self.storage.credentials()
        if not data:
            return None
        credentials = Credentials.from_authorized_user_info(data, [GMAIL_SCOPE])
        if credentials.expired and credentials.refresh_token:
            from google.auth.transport.requests import Request
            credentials.refresh(Request())
            self.storage.save_credentials(credentials)
        return credentials

    def service(self):
        credentials = self.credentials()
        return build("gmail", "v1", credentials=credentials, cache_discovery=False) if credentials else None

    def profile(self) -> dict[str, Any] | None:
        service = self.service()
        return service.users().getProfile(userId="me").execute() if service else None

    def list_messages(self, query: str, max_results: int = 25) -> list[dict[str, Any]]:
        service = self.service()
        if service is None:
            raise RuntimeError("Gmail no está conectado")
        result = service.users().messages().list(userId="me", q=query, maxResults=min(max_results, 100)).execute()
        return [self.message(service, item["id"], include_thread=False) for item in result.get("messages", [])]

    def message(self, service: Any, message_id: str, include_thread: bool = True) -> dict[str, Any]:
        raw = service.users().messages().get(userId="me", id=message_id, format="full").execute()
        message = self._message_fields(raw) | {"id": message_id}
        if include_thread and raw.get("threadId"):
            thread = service.users().threads().get(userId="me", id=raw["threadId"], format="full").execute()
            message["thread"] = [self._message_fields(item) | {"id": item.get("id", "")} for item in thread.get("messages", [])]
        return message

    def attachment_info(self, message_id: str, reference: str) -> GmailAttachment | None:
        service = self.service()
        if service is None:
            raise RuntimeError("Gmail no está conectado")
        raw = service.users().messages().get(userId="me", id=message_id, format="full").execute()
        return next((item for item in self._attachments(message_id, raw.get("payload", {}))
                     if item.id == reference or item.fingerprint == reference or item.part_id == reference), None)

    def download(self, message_id: str, reference: str, attachment: GmailAttachment | None = None) -> tuple[bytes, str, str]:
        service = self.service()
        if service is None:
            raise RuntimeError("Gmail no está conectado")
        if attachment is None:
            attachment = self.attachment_info(message_id, reference)
        if attachment is None:
            raise ValueError("El adjunto no existe")
        cached = self.storage.downloaded_file(attachment.fingerprint)
        if cached:
            return cached[0], cached[1], attachment.fingerprint
        if attachment.inline_data:
            content = _decode_bytes(attachment.inline_data)
        else:
            result = service.users().messages().attachments().get(userId="me", messageId=message_id, id=attachment.id).execute()
            content = _decode_bytes(result.get("data"))
        if not content:
            raise ValueError("Gmail devolvió un adjunto vacío")
        if attachment.is_pdf and not content.startswith(b"%PDF-"):
            raise ValueError("El adjunto no contiene un PDF válido")
        self.storage.save_download(attachment.fingerprint, content, attachment.name)
        return content, attachment.name, attachment.fingerprint

    def _message_fields(self, raw: dict[str, Any]) -> dict[str, Any]:
        payload = raw.get("payload", {})
        headers = {header.get("name", "").lower(): _decode_header(header.get("value")) for header in payload.get("headers", [])}
        sender_name, sender_email = parseaddr(headers.get("from", ""))
        plain, body_html = self._message_body(payload)
        attachments = self._attachments(raw.get("id", ""), payload)
        received_at = headers.get("date", "")
        try:
            received_at = parsedate_to_datetime(received_at).isoformat()
        except (TypeError, ValueError, OverflowError):
            received_at = raw.get("internalDate", "")
        labels = raw.get("labelIds", [])
        all_text = " ".join([headers.get("subject", ""), plain, *(item.name for item in attachments)])
        inline_resources = [
            {"contentId": item.content_id, "attachmentId": item.id,
             "attachmentKey": item.fingerprint, "mimeType": item.mime_type}
            for item in attachments
            if item.content_id and item.mime_type in IMAGE_MIMES
        ]
        return {"threadId": raw.get("threadId"), "sender": sender_name or sender_email or "Remitente desconocido",
                "senderEmail": sender_email, "subject": headers.get("subject") or "(Sin asunto)",
                "body": plain, "bodyHtml": _sanitize_html(body_html) if body_html else None,
                "preview": plain[:220] or raw.get("snippet", ""), "receivedAt": received_at,
                "unread": "UNREAD" in labels, "mailbox": "sent" if "SENT" in labels else "inbox",
                "receivedLabel": received_at, "labels": labels,
                "to": self._addresses(headers.get("to", "")),
                "cc": self._addresses(headers.get("cc", "")),
                "hasAttachments": bool(attachments), "inlineResources": inline_resources,
                "policyType": "Póliza" if POLICY_TERMS.search(all_text) else "Documento",
                "isPolicyRelated": bool(POLICY_TERMS.search(all_text)),
                "attachments": [self._attachment_response(item) for item in attachments]}

    def _attachment_response(self, item: GmailAttachment) -> dict[str, Any]:
        return {"id": item.fingerprint, "attachmentId": item.id, "name": item.name,
                "attachmentKey": item.fingerprint,
                "type": "pdf" if item.is_pdf else ("image" if item.mime_type.startswith("image/") else "file"),
                "mimeType": item.mime_type, "size": self._size_label(item.size),
                "isPdf": item.is_pdf, "isImage": item.mime_type.startswith("image/"),
                "isPreviewable": item.is_pdf or item.mime_type in IMAGE_MIMES,
                "extractionStatus": self.storage.document_status(item.fingerprint)}

    @staticmethod
    def _addresses(value: str) -> list[dict[str, str]]:
        return [{"name": name, "email": address} for name, address in getaddresses([value]) if address]

    def _message_body(self, payload: dict[str, Any]) -> tuple[str, str]:
        plain: list[str] = []
        html_parts: list[str] = []
        def visit(part: dict[str, Any]) -> None:
            mime = part.get("mimeType", "")
            data = _decode_text(part.get("body", {}).get("data"))
            if mime == "text/plain" and data: plain.append(data)
            elif mime == "text/html" and data: html_parts.append(data)
            for child in part.get("parts", []) or []: visit(child)
        visit(payload)
        plain_text = "\n\n".join(re.sub(r"[ \t]+", " ", part).strip() for part in plain if part.strip())
        return plain_text or _plain_text(" ".join(html_parts)), "\n".join(html_parts)

    def _attachments(self, message_id: str, payload: dict[str, Any]) -> list[GmailAttachment]:
        result: list[GmailAttachment] = []
        def visit(part: dict[str, Any], path: str = "0") -> None:
            filename = _decode_header(part.get("filename"))
            mime = part.get("mimeType", "application/octet-stream")
            body = part.get("body", {})
            attachment_id = body.get("attachmentId")
            inline_data = body.get("data")
            headers = {item.get("name", "").lower(): _decode_header(item.get("value")) for item in part.get("headers", [])}
            content_id = headers.get("content-id", "").strip().strip("<>") or None
            if filename or attachment_id or content_id:
                part_id = part.get("partId") or path
                is_pdf = filename.lower().endswith(".pdf") or mime == "application/pdf"
                reference = f"{message_id}:{part_id}:{filename}:{content_id or ''}:{mime}"
                fingerprint = hashlib.sha256(reference.encode()).hexdigest()
                result.append(GmailAttachment(attachment_id or part_id, filename or f"adjunto-{part_id}",
                                              int(body.get("size", 0)), mime, is_pdf, fingerprint,
                                              inline_data, content_id, part_id))
            for index, child in enumerate(part.get("parts", []) or []): visit(child, f"{path}.{index}")
        visit(payload)
        return result

    @staticmethod
    def _size_label(size: int) -> str:
        if size <= 0: return "Tamaño desconocido"
        return f"{size / 1024 / 1024:.1f} MB" if size >= 1024 * 1024 else f"{size / 1024:.0f} KB"
