from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import logging
import secrets
from typing import Literal
from urllib.parse import quote, unquote

from fastapi import Body, FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response

from .config import settings
from .extraction import extract_document
from .gmail import GmailClient, compute_content_hash, generate_pkce_pair
from .imap_service import ImapError, ImapService
from .imap_storage import LOCAL_OWNER_ID, ImapStorage
from .storage import GmailStorage


app = FastAPI(title="Singularity Gmail API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_url.rstrip("/")],
                   allow_credentials=False, allow_methods=["GET", "POST", "PATCH", "DELETE"],
                   allow_headers=["Content-Type"])
storage = GmailStorage(settings.data_dir)
gmail = GmailClient(storage)
imap_storage = ImapStorage(settings.data_dir, settings.imap_credential_key)
imap = ImapService(imap_storage)
logger = logging.getLogger("singularity")


def _imap_payload(payload: dict[str, object], current: dict[str, object] | None = None) -> tuple[dict[str, object], str | None]:
    source = current or {}
    label = str(payload.get("label", source.get("label", ""))).strip()
    email = str(payload.get("email", source.get("email", ""))).strip()
    username = str(payload.get("username", source.get("username", ""))).strip()
    host = str(payload.get("host", source.get("host", ""))).strip()
    security = str(payload.get("security", source.get("security", "ssl"))).strip().lower()
    auth_method = str(payload.get("authMethod", source.get("authMethod", "password"))).strip().lower()
    try:
        port = int(payload.get("port", source.get("port", 993)))
    except (TypeError, ValueError) as error:
        raise HTTPException(status_code=400, detail="El puerto IMAP no es válido") from error
    password_value = payload.get("password")
    password = password_value.strip() if isinstance(password_value, str) else None
    if not label or len(label) > 100:
        raise HTTPException(status_code=400, detail="El nombre de la cuenta es obligatorio")
    if not email or len(email) > 320 or "@" not in email:
        raise HTTPException(status_code=400, detail="La dirección de correo no es válida")
    if not username or len(username) > 320:
        raise HTTPException(status_code=400, detail="El usuario IMAP es obligatorio")
    if not host or len(host) > 253:
        raise HTTPException(status_code=400, detail="El servidor IMAP es obligatorio")
    if not 1 <= port <= 65535:
        raise HTTPException(status_code=400, detail="El puerto IMAP no es válido")
    if security not in {"ssl", "starttls", "none"}:
        raise HTTPException(status_code=400, detail="La seguridad IMAP no es válida")
    if auth_method != "password":
        raise HTTPException(status_code=400, detail="OAuth IMAP todavía no está habilitado")
    if current is None and not password:
        raise HTTPException(status_code=400, detail="La contraseña es obligatoria al crear la cuenta")
    return {
        "label": label,
        "email": email,
        "username": username,
        "host": host,
        "port": port,
        "security": security,
        "authMethod": auth_method,
    }, password


def _imap_connection_error(error: Exception) -> HTTPException:
    if isinstance(error, ImapError):
        return HTTPException(status_code=502, detail=str(error))
    return HTTPException(status_code=502, detail="No fue posible conectar con la cuenta IMAP")


def _refresh_imap_status(account: dict[str, object]) -> dict[str, object]:
    account_id = str(account["id"])
    try:
        folders = imap.test_connection(account)
        imap_storage.save_status(account_id, "connected", folders=folders)
    except Exception as error:
        message = str(error) if isinstance(error, ImapError) else "No fue posible conectar con la cuenta IMAP"
        imap_storage.save_status(account_id, "error", error=message)
    refreshed = imap_storage.list_accounts(LOCAL_OWNER_ID)
    return next(item for item in refreshed if item["id"] == account_id)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/auth/google")
def auth_google() -> RedirectResponse:
    try:
        state = secrets.token_urlsafe(32)
        verifier, challenge = generate_pkce_pair()
        storage.save_oauth_state(state, datetime.now(timezone.utc) + timedelta(minutes=10), verifier)
        return RedirectResponse(gmail.authorization_url(state, verifier, challenge))
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.get("/api/auth/callback/google")
def auth_callback(code: str | None = None, state: str | None = None,
                  error: str | None = None) -> RedirectResponse:
    verifier = storage.consume_oauth_state(state) if state else None
    if not state or not verifier:
        raise HTTPException(status_code=400, detail="Estado OAuth inválido o expirado")
    if error:
        raise HTTPException(status_code=400, detail="La autorización de Google fue cancelada o rechazada")
    if not code:
        raise HTTPException(status_code=400, detail="Google no devolvió un código de autorización")
    try:
        gmail.finish_authorization(code, state, verifier)
    except Exception as exc:
        logger.error("OAuth token exchange failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="No fue posible completar OAuth con Google") from exc
    return RedirectResponse(f"{settings.frontend_url.rstrip('/')}/correos")


@app.get("/api/gmail/status")
def gmail_status() -> dict[str, object]:
    try:
        profile = gmail.profile()
    except Exception as exc:
        raise HTTPException(status_code=502, detail="No fue posible consultar el estado de Gmail") from exc
    return {"connected": profile is not None, "email": profile.get("emailAddress") if profile else None}


@app.get("/api/imap/accounts")
def imap_accounts() -> dict[str, object]:
    accounts = []
    for account in imap_storage.list_accounts(LOCAL_OWNER_ID):
        raw = imap_storage.get_account(str(account["id"]), LOCAL_OWNER_ID)
        if raw is not None:
            accounts.append(_refresh_imap_status(raw))
    return {"accounts": accounts}


@app.post("/api/imap/accounts/test")
def test_imap_account(payload: dict[str, object] = Body(...)) -> dict[str, object]:
    account_id = payload.get("accountId")
    current = imap_storage.get_account(str(account_id), LOCAL_OWNER_ID) if isinstance(account_id, str) and account_id else None
    values, password = _imap_payload(payload, current)
    values["id"] = "test"
    values["password"] = password or (current["password"] if current else "")
    try:
        folders = imap.test_connection(values)
    except Exception as error:
        raise _imap_connection_error(error) from error
    return {"ok": True, "status": "connected", "folders": folders}


@app.post("/api/imap/accounts")
def create_imap_account(payload: dict[str, object] = Body(...)) -> dict[str, object]:
    values, password = _imap_payload(payload)
    values["id"] = "new"
    values["password"] = password
    try:
        folders = imap.test_connection(values)
        account = imap_storage.create_account(values, str(password), LOCAL_OWNER_ID)
        imap_storage.save_status(str(account["id"]), "connected", folders=folders)
    except Exception as error:
        raise _imap_connection_error(error) from error
    return {"account": next(item for item in imap_storage.list_accounts(LOCAL_OWNER_ID) if item["id"] == account["id"])}


@app.patch("/api/imap/accounts/{account_id}")
def update_imap_account(account_id: str, payload: dict[str, object] = Body(...)) -> dict[str, object]:
    current = imap_storage.get_account(account_id, LOCAL_OWNER_ID)
    if current is None:
        raise HTTPException(status_code=404, detail="La cuenta IMAP no existe")
    values, password = _imap_payload(payload, current)
    values["id"] = account_id
    values["password"] = password or current["password"]
    try:
        folders = imap.test_connection(values)
        account = imap_storage.update_account(account_id, values, password, LOCAL_OWNER_ID)
        if account is None:
            raise HTTPException(status_code=404, detail="La cuenta IMAP no existe")
        imap_storage.save_status(account_id, "connected", folders=folders)
    except HTTPException:
        raise
    except Exception as error:
        raise _imap_connection_error(error) from error
    return {"account": next(item for item in imap_storage.list_accounts(LOCAL_OWNER_ID) if item["id"] == account_id)}


@app.post("/api/imap/accounts/{account_id}/test")
def retest_imap_account(account_id: str) -> dict[str, object]:
    account = imap_storage.get_account(account_id, LOCAL_OWNER_ID)
    if account is None:
        raise HTTPException(status_code=404, detail="La cuenta IMAP no existe")
    try:
        folders = imap.test_connection(account)
        imap_storage.save_status(account_id, "connected", folders=folders)
    except Exception as error:
        message = str(error) if isinstance(error, ImapError) else "No fue posible conectar con la cuenta IMAP"
        imap_storage.save_status(account_id, "error", error=message)
        raise _imap_connection_error(error) from error
    return {"account": next(item for item in imap_storage.list_accounts(LOCAL_OWNER_ID) if item["id"] == account_id)}


@app.delete("/api/imap/accounts/{account_id}")
def delete_imap_account(account_id: str) -> dict[str, bool]:
    if not imap_storage.delete_account(account_id, LOCAL_OWNER_ID):
        raise HTTPException(status_code=404, detail="La cuenta IMAP no existe")
    return {"ok": True}


@app.get("/api/imap/accounts/{account_id}/folders")
def imap_account_folders(account_id: str) -> dict[str, object]:
    account = imap_storage.get_account(account_id, LOCAL_OWNER_ID)
    if account is None:
        raise HTTPException(status_code=404, detail="La cuenta IMAP no existe")
    try:
        folders = imap.test_connection(account)
        imap_storage.save_status(account_id, "connected", folders=folders)
    except Exception as error:
        raise _imap_connection_error(error) from error
    return {"folders": folders}


def _imap_attachment_status(account_id: str, message_id: str, attachment_id: str) -> str:
    entry = storage.document_by_source(message_id=message_id, attachment_id=attachment_id, account_id=account_id)
    if entry is None:
        return "pending"
    status = str(entry.get("status", "pending"))
    if status in {"extracted", "not-policy", "processing", "error"}:
        return status
    return "pending"


def _annotate_imap_messages(messages: list[dict[str, object]], account_id: str) -> list[dict[str, object]]:
    for message in messages:
        message_id = str(message.get("id") or "")
        attachments = message.get("attachments")
        if not isinstance(attachments, list):
            continue
        for attachment in attachments:
            if isinstance(attachment, dict):
                attachment["extractionStatus"] = _imap_attachment_status(
                    account_id, message_id, str(attachment.get("id") or ""),
                )
    return messages


@app.get("/api/imap/messages")
def imap_messages(
    account_id: str = Query(..., min_length=1, max_length=100),
    folder: str = Query("INBOX", min_length=1, max_length=200),
    limit: int = Query(50, ge=1, le=50),
) -> dict[str, object]:
    account = imap_storage.get_account(account_id, LOCAL_OWNER_ID)
    if account is None:
        raise HTTPException(status_code=404, detail="La cuenta IMAP no existe")
    try:
        messages = _annotate_imap_messages(imap.list_messages(account, folder, limit), account_id)
    except Exception as error:
        raise _imap_connection_error(error) from error
    return {"messages": messages, "accountId": account_id, "folder": folder, "count": len(messages)}


@app.get("/api/imap/messages/{message_id}")
def imap_message(message_id: str, account_id: str = Query(..., min_length=1, max_length=100)) -> dict[str, object]:
    account = imap_storage.get_account(account_id, LOCAL_OWNER_ID)
    if account is None:
        raise HTTPException(status_code=404, detail="La cuenta IMAP no existe")
    try:
        message = imap.get_message(account, unquote(message_id).strip())
        _annotate_imap_messages([message], account_id)
        return message
    except Exception as error:
        raise _imap_connection_error(error) from error


@app.get("/api/imap/attachments/{message_id}/{attachment_id}")
def imap_attachment(
    message_id: str,
    attachment_id: str,
    account_id: str = Query(..., min_length=1, max_length=100),
    download: bool = Query(False),
) -> Response:
    account = imap_storage.get_account(account_id, LOCAL_OWNER_ID)
    if account is None:
        raise HTTPException(status_code=404, detail="La cuenta IMAP no existe")
    try:
        content, filename, mime_type = imap.download_attachment(
            account,
            unquote(message_id).strip(),
            unquote(attachment_id).strip(),
        )
        safe_name = quote(filename.replace("\r", "").replace("\n", ""), safe="")
        previewable = mime_type == "application/pdf" or mime_type.startswith("image/")
        disposition = "attachment" if download or not previewable else "inline"
        return Response(
            content=content,
            media_type=mime_type,
            headers={"Cache-Control": "private, max-age=300",
                     "Content-Disposition": f'{disposition}; filename="{safe_name}"'},
        )
    except Exception as error:
        raise _imap_connection_error(error) from error


@app.get("/api/gmail/messages")
def gmail_messages(mailbox: Literal["inbox", "sent"] = "inbox",
                   query: str = Query("", max_length=200)) -> dict[str, object]:
    try:
        effective_query = query.strip() or f"in:{mailbox}"
        messages = gmail.list_messages(effective_query)
    except RuntimeError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="No fue posible consultar los mensajes de Gmail") from exc
    return {"messages": messages, "query": effective_query, "mailbox": mailbox, "count": len(messages)}


@app.get("/api/gmail/messages/{message_id}")
def gmail_message(message_id: str) -> dict[str, object]:
    try:
        service = gmail.service()
        if service is None:
            raise RuntimeError("Gmail no está conectado")
        return gmail.message(service, message_id, include_thread=True)
    except RuntimeError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="No fue posible cargar el correo") from exc


@app.get("/api/gmail/documents")
def gmail_documents() -> dict[str, object]:
    documents: list[dict[str, object]] = []
    for fingerprint, entry in storage.document_records():
        result = entry.get("result") if isinstance(entry.get("result"), dict) else None
        source = entry.get("source") if isinstance(entry.get("source"), dict) else {}
        documents.append({
            "id": fingerprint,
            "filename": str(entry.get("filename", "document.pdf")),
            "status": str(entry.get("status", "pending")),
            "origin": storage.document_origin(entry),
            "result": result,
            "messageId": source.get("messageId"),
            "attachmentId": source.get("attachmentId"),
            "attachmentKey": source.get("attachmentKey", fingerprint),
            "contentHash": entry.get("contentHash"),
            "sizeBytes": entry.get("sizeBytes"),
            "mimeType": entry.get("mimeType"),
            "uploadedAt": entry.get("uploadedAt"),
            "sources": entry.get("sources") if isinstance(entry.get("sources"), list) else [],
            "createdAt": result.get("extractedAt") if result else None,
        })
    documents.sort(key=lambda item: str(item.get("createdAt") or ""), reverse=True)
    return {"documents": documents, "count": len(documents)}


@app.get("/api/gmail/documents/{document_id}/file")
def gmail_document_file(document_id: str, download: bool = Query(False)) -> Response:
    cached = storage.downloaded_file(unquote(document_id).strip())
    if cached is None:
        raise HTTPException(status_code=404, detail="El archivo de la extracción no está disponible")
    content, filename = cached
    safe_name = quote(filename.replace("\r", "").replace("\n", ""), safe="")
    disposition = "attachment" if download else "inline"
    return Response(
        content=content,
        media_type="application/pdf",
        headers={"Cache-Control": "private, max-age=300",
                 "Content-Disposition": f'{disposition}; filename="{safe_name}"'},
    )


@app.get("/api/gmail/attachments/{message_id}/{attachment_id}")
def gmail_attachment(message_id: str, attachment_id: str,
                     download: bool = Query(False)) -> Response:
    try:
        message_id = unquote(message_id).strip()
        attachment_id = unquote(attachment_id).strip()
        attachment = gmail.attachment_info(message_id, attachment_id)
        if attachment is None:
            raise ValueError("El adjunto no existe en el mensaje")
        content, filename, _ = gmail.download(message_id, attachment_id, attachment)
        previewable = attachment.is_pdf or attachment.mime_type.startswith("image/")
        safe_name = quote(filename.replace("\r", "").replace("\n", ""), safe="")
        disposition = "attachment" if download or not previewable else "inline"
        return Response(content=content, media_type=attachment.mime_type,
                        headers={"Cache-Control": "private, max-age=300",
                                 "Content-Disposition": f'{disposition}; filename="{safe_name}"'})
    except RuntimeError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="No fue posible descargar el archivo") from exc


def _store_attachment_extraction(content: bytes, filename: str, origin: str,
                                 source: dict[str, object], method: Literal["rules", "gemini"],
                                 suggested_id: str | None) -> dict[str, object]:
    content_hash = compute_content_hash(content)
    by_source = storage.document_by_source(
        message_id=str(source.get("messageId") or "") or None,
        attachment_id=str(source.get("attachmentId") or "") or None,
        account_id=str(source.get("accountId") or "") or None,
    )
    if by_source is not None and by_source.get("result"):
        return dict(by_source["result"])
    record = storage.register_document(
        content, filename, content_hash, "application/pdf",
        origin=origin, source=source, suggested_id=suggested_id,
    )
    document_id = str(record["id"])
    storage.set_document_status(
        document_id, "processing", filename=filename,
    )
    result = extract_document(filename, content, method, "application/pdf")
    result["documentStatus"] = "extracted" if result.get("policyType") else "not-policy"
    result["documentId"] = document_id
    result["source"] = record.get("source") or source
    storage.set_document_status(
        document_id,
        str(result["documentStatus"]),
        filename=filename,
        result=result,
        source=result["source"],
    )
    return result


@app.post("/api/gmail/attachments/{message_id}/{attachment_id}/extract")
def extract_gmail_attachment(message_id: str, attachment_id: str,
                             method: Literal["rules", "gemini"] = Query("gemini")) -> dict[str, object]:
    try:
        attachment = gmail.attachment_info(message_id, attachment_id)
        if attachment is None or not attachment.is_pdf:
            raise ValueError("Solo se pueden extraer archivos PDF")
        content, filename, fingerprint = gmail.download(message_id, attachment_id, attachment)
        return _store_attachment_extraction(
            content, filename, "gmail",
            {"messageId": message_id, "attachmentId": attachment.id,
             "attachmentKey": attachment.fingerprint},
            method, fingerprint,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Attachment extraction failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="No fue posible extraer el documento") from exc


@app.post("/api/imap/attachments/{message_id}/{attachment_id}/extract")
def extract_imap_attachment(
    message_id: str,
    attachment_id: str,
    account_id: str = Query(..., min_length=1, max_length=100),
    method: Literal["rules", "gemini"] = Query("gemini"),
) -> dict[str, object]:
    account = imap_storage.get_account(account_id, LOCAL_OWNER_ID)
    if account is None:
        raise HTTPException(status_code=404, detail="La cuenta IMAP no existe")
    try:
        content, filename, mime_type = imap.download_attachment(
            account,
            unquote(message_id).strip(),
            unquote(attachment_id).strip(),
        )
        if mime_type != "application/pdf" and not filename.lower().endswith(".pdf"):
            raise ValueError("Solo se pueden extraer archivos PDF")
        return _store_attachment_extraction(
            content, filename, "imap",
            {"accountId": account_id, "messageId": unquote(message_id).strip(),
             "attachmentId": unquote(attachment_id).strip()},
            method, None,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as error:
        raise _imap_connection_error(error) from error


@app.post("/api/extractions/{method}")
async def extraction(
    method: Literal["rules", "gemini"],
    file: UploadFile = File(...),
    policy_type: str | None = Query(None),
) -> dict[str, object]:
    filename = file.filename or "document.pdf"
    content_type = file.content_type or ""
    allowed_types = {"application/pdf", "image/png", "image/jpeg", "image/webp"}
    if content_type not in allowed_types and not filename.lower().endswith((".pdf", ".png", ".jpg", ".jpeg", ".webp")):
        raise HTTPException(status_code=415, detail="Solo se aceptan PDF, PNG, JPG o WEBP")
    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 25 MB")
    if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
        if not content.startswith(b"%PDF-"):
            raise HTTPException(status_code=415, detail="El archivo no contiene un PDF válido")
    return extract_document(filename, content, method, content_type, policy_type)


ALLOWED_DOCUMENT_TYPES = {"application/pdf", "image/png", "image/jpeg", "image/webp"}


def _validate_upload(filename: str, content_type: str, content: bytes) -> None:
    if content_type not in ALLOWED_DOCUMENT_TYPES and not filename.lower().endswith(
            (".pdf", ".png", ".jpg", ".jpeg", ".webp")):
        raise HTTPException(status_code=415, detail="Solo se aceptan PDF, PNG, JPG o WEBP")
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="El archivo supera el límite de 25 MB")
    if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
        if not content.startswith(b"%PDF-"):
            raise HTTPException(status_code=415, detail="El archivo no contiene un PDF válido")


@app.get("/api/documents")
def documents() -> dict[str, object]:
    items: list[dict[str, object]] = []
    for fingerprint, entry in storage.document_records():
        result = entry.get("result") if isinstance(entry.get("result"), dict) else None
        items.append({
            "id": fingerprint,
            "filename": str(entry.get("filename", "document.pdf")),
            "status": str(entry.get("status", "pending")),
            "origin": storage.document_origin(entry),
            "contentHash": entry.get("contentHash"),
            "sizeBytes": entry.get("sizeBytes"),
            "mimeType": entry.get("mimeType"),
            "uploadedAt": entry.get("uploadedAt"),
            "sources": entry.get("sources") if isinstance(entry.get("sources"), list) else [],
            "result": result,
            "createdAt": result.get("extractedAt") if result else entry.get("uploadedAt"),
        })
    items.sort(key=lambda item: str(item.get("createdAt") or ""), reverse=True)
    return {"documents": items, "count": len(items)}


@app.post("/api/documents")
async def register_document(
    file: UploadFile = File(...),
    force_new: bool = Query(False),
) -> dict[str, object]:
    filename = file.filename or "document.pdf"
    content_type = file.content_type or ""
    content = await file.read()
    _validate_upload(filename, content_type, content)
    content_hash = compute_content_hash(content)
    return storage.register_manual_document(
        content, filename, content_hash, content_type, force_new=force_new,
    )


@app.get("/api/documents/{document_id}/extractions")
def get_document_extractions(document_id: str) -> dict[str, object]:
    key = unquote(document_id).strip()
    if storage.document_record(key) is None:
        raise HTTPException(status_code=404, detail="El documento no existe")
    return {"documentId": key, "extractions": storage.list_extractions(key)}


@app.put("/api/documents/{document_id}/extractions/{method}")
def put_document_extraction(
    document_id: str,
    method: Literal["manual", "gemini"],
    payload: dict[str, object] = Body(...),
) -> dict[str, object]:
    key = unquote(document_id).strip()
    if storage.document_record(key) is None:
        raise HTTPException(status_code=404, detail="El documento no existe")
    fields = payload.get("fields")
    if not isinstance(fields, list):
        raise HTTPException(status_code=400, detail="El campo 'fields' es obligatorio")
    stored = {
        "fields": fields,
        "updatedAt": str(payload.get("updatedAt") or datetime.now(timezone.utc).isoformat()),
        "method": method,
    }
    storage.set_extraction(key, method, stored)
    return {"documentId": key, "method": method, "extraction": stored}


@app.delete("/api/documents/{document_id}/extractions/{method}")
def delete_document_extraction(
    document_id: str,
    method: Literal["manual", "gemini"],
) -> dict[str, object]:
    key = unquote(document_id).strip()
    if not storage.remove_extraction(key, method):
        raise HTTPException(status_code=404, detail="La extracción no existe")
    remaining = sorted(storage.list_extractions(key).keys())
    return {"documentId": key, "method": method, "remaining": remaining}


@app.get("/api/documents/{document_id}/file")
def document_file(document_id: str, download: bool = Query(False)) -> Response:
    key = unquote(document_id).strip()
    entry = storage.document_record(key)
    if entry is None:
        raise HTTPException(status_code=404, detail="El archivo del documento no está disponible")
    target = storage.download_dir / f"{key}.bin"
    if not target.is_file():
        raise HTTPException(status_code=404, detail="El archivo del documento no está disponible")
    filename = str(entry.get("filename", "document.pdf"))
    safe_name = quote(filename.replace("\r", "").replace("\n", ""), safe="")
    disposition = "attachment" if download else "inline"
    return Response(
        content=target.read_bytes(),
        media_type=str(entry.get("mimeType", "application/octet-stream")),
        headers={"Cache-Control": "private, max-age=300",
                 "Content-Disposition": f'{disposition}; filename="{safe_name}"'},
    )


@app.delete("/api/documents/{document_id}")
def delete_document(document_id: str) -> dict[str, object]:
    key = unquote(document_id).strip()
    try:
        storage.delete_document(key)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="El documento no existe") from exc
    except PermissionError as exc:
        if str(exc) in {"gmail", "imap"}:
            raise HTTPException(status_code=403,
                                detail="Los documentos recibidos por correo no se pueden eliminar") from exc
        raise HTTPException(status_code=403,
                            detail="El documento no se puede eliminar") from exc
    return {"id": key, "deleted": True}
