from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import logging
import secrets
from typing import Literal
from urllib.parse import quote, unquote

from fastapi import FastAPI, HTTPException, Query, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse, Response

from .config import settings
from .extraction import extract_document
from .gmail import GmailClient, generate_pkce_pair
from .storage import GmailStorage


app = FastAPI(title="Singularity Gmail API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_url.rstrip("/")],
                   allow_credentials=False, allow_methods=["GET", "POST"],
                   allow_headers=["Content-Type"])
storage = GmailStorage(settings.data_dir)
gmail = GmailClient(storage)
logger = logging.getLogger("singularity")


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
            "result": result,
            "messageId": source.get("messageId"),
            "attachmentId": source.get("attachmentId"),
            "attachmentKey": source.get("attachmentKey", fingerprint),
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


@app.post("/api/gmail/attachments/{message_id}/{attachment_id}/extract")
def extract_gmail_attachment(message_id: str, attachment_id: str,
                             method: Literal["rules", "gemini"] = Query("gemini")) -> dict[str, object]:
    try:
        attachment = gmail.attachment_info(message_id, attachment_id)
        if attachment is None or not attachment.is_pdf:
            raise ValueError("Solo se pueden extraer archivos PDF")
        existing = storage.document_record(attachment.fingerprint)
        if existing and existing.get("result"):
            return existing["result"]
        storage.set_document_status(attachment.fingerprint, "processing", filename=attachment.name)
        content, filename, fingerprint = gmail.download(message_id, attachment_id, attachment)
        result = extract_document(filename, content, method, "application/pdf")
        result["documentStatus"] = "extracted" if result.get("policyType") else "not-policy"
        result["documentId"] = fingerprint
        result["source"] = {"messageId": message_id, "attachmentId": attachment.id,
                            "attachmentKey": attachment.fingerprint}
        storage.set_document_status(
            fingerprint,
            result["documentStatus"],
            filename=filename,
            result=result,
            source=result["source"],
        )
        return result
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Attachment extraction failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="No fue posible extraer el documento") from exc


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
