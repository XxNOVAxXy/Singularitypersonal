import hashlib
import json
import os
import secrets
from datetime import datetime, timezone
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Any


class JsonStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if not self.path.exists():
            self.write({})

    def read(self) -> dict[str, Any]:
        try:
            value = json.loads(self.path.read_text(encoding="utf-8"))
            return value if isinstance(value, dict) else {}
        except (OSError, json.JSONDecodeError):
            return {}

    def write(self, value: dict[str, Any]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.path.parent, delete=False) as temp:
            json.dump(value, temp, ensure_ascii=True, indent=2)
            temp.flush()
            os.fsync(temp.fileno())
            temporary_path = Path(temp.name)
        os.replace(temporary_path, self.path)


class GmailStorage:
    def __init__(self, data_dir: Path) -> None:
        self.token_store = JsonStore(data_dir / "token.json")
        self.state_store = JsonStore(data_dir / "processed.json")
        self.document_store = JsonStore(data_dir / "document_states.json")
        self.oauth_state_store = JsonStore(data_dir / "oauth_states.json")
        self.extraction_store = JsonStore(data_dir / "extractions.json")
        self.download_dir = data_dir / "downloads"
        self.download_dir.mkdir(parents=True, exist_ok=True)

    def save_credentials(self, credentials: Any) -> None:
        self.token_store.write(json.loads(credentials.to_json()))

    def credentials(self) -> dict[str, Any] | None:
        value = self.token_store.read()
        return value or None

    def mark_downloaded(self, fingerprint: str, filename: str) -> None:
        state = self.state_store.read()
        state[fingerprint] = {"filename": filename, "status": "downloaded"}
        self.state_store.write(state)

    def is_processed(self, fingerprint: str) -> bool:
        return fingerprint in self.state_store.read()

    def document_status(self, fingerprint: str) -> str:
        entry = self.document_store.read().get(fingerprint)
        return str(entry.get("status", "pending")) if isinstance(entry, dict) else "pending"

    def document_record(self, fingerprint: str) -> dict[str, Any] | None:
        entry = self.document_store.read().get(fingerprint)
        return entry if isinstance(entry, dict) else None

    def document_records(self) -> list[tuple[str, dict[str, Any]]]:
        return [
            (fingerprint, entry)
            for fingerprint, entry in self.document_store.read().items()
            if isinstance(entry, dict)
        ]

    def set_document_status(self, fingerprint: str, status: str, *, filename: str | None = None,
                            result: dict[str, Any] | None = None, error: str | None = None,
                            source: dict[str, Any] | None = None,
                            origin: str | None = None,
                            content_hash: str | None = None,
                            size_bytes: int | None = None,
                            mime_type: str | None = None,
                            sources: list[dict[str, Any]] | None = None,
                            uploaded_at: str | None = None) -> None:
        documents = self.document_store.read()
        entry = documents.get(fingerprint) if isinstance(documents.get(fingerprint), dict) else {}
        entry["status"] = status
        if filename:
            entry["filename"] = filename
        if result is not None:
            entry["result"] = result
        if source is not None:
            entry["source"] = source
        if error is not None:
            entry["error"] = error
        else:
            entry.pop("error", None)
        if origin is not None:
            entry["origin"] = origin
        if content_hash is not None:
            entry["contentHash"] = content_hash
        if size_bytes is not None:
            entry["sizeBytes"] = size_bytes
        if mime_type is not None:
            entry["mimeType"] = mime_type
        if sources is not None:
            entry["sources"] = sources
        if uploaded_at is not None:
            entry["uploadedAt"] = uploaded_at
        documents[fingerprint] = entry
        self.document_store.write(documents)

    def save_oauth_state(self, state: str, expires_at: datetime, verifier: str) -> None:
        states = self.oauth_state_store.read()
        now = datetime.now(timezone.utc).timestamp()
        states = {
            key: value for key, value in states.items()
            if isinstance(value, dict) and float(value.get("expires_at", 0)) > now
        }
        states[self._state_key(state)] = {"expires_at": expires_at.timestamp(), "code_verifier": verifier}
        self.oauth_state_store.write(states)

    def consume_oauth_state(self, state: str) -> str | None:
        states = self.oauth_state_store.read()
        entry = states.pop(self._state_key(state), None)
        self.oauth_state_store.write(states)
        if not isinstance(entry, dict):
            return None
        if float(entry.get("expires_at", 0)) <= datetime.now(timezone.utc).timestamp():
            return None
        verifier = entry.get("code_verifier")
        return verifier if isinstance(verifier, str) and verifier else None

    def save_download(self, fingerprint: str, content: bytes, filename: str) -> None:
        if len(content) > 25 * 1024 * 1024:
            raise ValueError("El archivo supera el límite permitido de 25 MB")
        (self.download_dir / f"{fingerprint}.bin").write_bytes(content)
        self.mark_downloaded(fingerprint, filename)

    def downloaded_file(self, fingerprint: str) -> tuple[bytes, str] | None:
        entry = self.state_store.read().get(fingerprint)
        target = self.download_dir / f"{fingerprint}.bin"
        if not isinstance(entry, dict) or not target.is_file():
            return None
        try:
            return target.read_bytes(), str(entry.get("filename", "document.pdf"))
        except OSError:
            return None

    @staticmethod
    def document_origin(entry: dict[str, Any]) -> str:
        origin = entry.get("origin")
        if isinstance(origin, str) and origin:
            return origin
        source = entry.get("source")
        if isinstance(source, dict) and source.get("accountId") and (source.get("messageId") or source.get("attachmentId")):
            return "imap"
        if isinstance(source, dict) and (source.get("messageId") or source.get("attachmentId")):
            return "gmail"
        # Sin origen explícito ni procedencia de correo se protege por defecto:
        # solo los documentos manuales (que siempre llevan origin="manual")
        # pueden eliminarse.
        return "gmail"

    @staticmethod
    def _document_references(entry: dict[str, Any]) -> list[dict[str, Any]]:
        """Referencias de procedencia de un documento: la principal y las fusionadas."""
        references: list[dict[str, Any]] = []
        primary = entry.get("source")
        if isinstance(primary, dict):
            references.append(primary)
        sources = entry.get("sources")
        if isinstance(sources, list):
            for item in sources:
                if isinstance(item, dict):
                    references.append(item)
        return references

    @staticmethod
    def _source_matches(source: dict[str, Any], *, message_id: str | None,
                        attachment_id: str | None, account_id: str | None) -> bool:
        if message_id is not None and source.get("messageId") != message_id:
            return False
        if attachment_id is not None and source.get("attachmentId") != attachment_id:
            return False
        if account_id is not None and source.get("accountId") != account_id:
            return False
        return True

    def document_by_source(self, *, message_id: str | None = None,
                           attachment_id: str | None = None,
                           account_id: str | None = None) -> dict[str, Any] | None:
        """Busca un documento registrado cuyas referencias coincidan.

        Se revisan la fuente principal y todas las referencias conservadas en
        `sources`: al fusionar el mismo documento recibido por Gmail e IMAP, la
        fuente principal solo conserva la última registración y la anterior
        queda en `sources`, por lo que el documento debe localizarse también
        por esa referencia.
        """
        if message_id is None and attachment_id is None and account_id is None:
            return None
        for doc_id, entry in self.document_records():
            for source in self._document_references(entry):
                if self._source_matches(
                    source,
                    message_id=message_id,
                    attachment_id=attachment_id,
                    account_id=account_id,
                ):
                    return {"id": doc_id, **entry}
        return None

    def find_by_content_hash(self, content_hash: str) -> tuple[str, dict[str, Any]] | None:
        for doc_id, entry in self.document_records():
            if entry.get("contentHash") == content_hash:
                return doc_id, entry
        return None

    @staticmethod
    def _source_key(source: dict[str, Any]) -> tuple[str, str, str, str]:
        message_id = str(source.get("messageId") or "")
        attachment_id = str(source.get("attachmentId") or "")
        account_id = str(source.get("accountId") or "")
        # Las fuentes de correo se identifican por la referencia del adjunto
        # (reenviar el mismo PDF no duplica la fuente); las manuales son
        # eventos de subida, por lo que cada una cuenta por separado.
        marker = "" if message_id else str(source.get("uploadedAt") or source.get("filename") or "")
        return message_id, attachment_id, account_id, marker

    @staticmethod
    def _merge_sources(existing: Any, reference: dict[str, Any]) -> list[dict[str, Any]]:
        sources = [item for item in existing if isinstance(item, dict)] if isinstance(existing, list) else []
        key = GmailStorage._source_key(reference)
        if any(GmailStorage._source_key(item) == key for item in sources):
            return sources
        sources.append(reference)
        return sources

    def register_document(self, content: bytes, filename: str, content_hash: str,
                          mime_type: str, *, origin: str, source: dict[str, Any] | None = None,
                          suggested_id: str | None = None,
                          force_new: bool = False) -> dict[str, Any]:
        """Registro unificado por contenido.

        El mismo PDF llegado por varias vías (manual, Gmail, IMAP) produce un
        único registro: conserva el id original y fusiona las fuentes en
        `sources`. `origin` queda como el de la primera registración para no
        romper la protección de borrado existente.
        """
        uploaded_at = datetime.now(timezone.utc).isoformat()
        reference: dict[str, Any] = {"origin": origin, "filename": filename, "uploadedAt": uploaded_at}
        if source:
            reference.update({key: value for key, value in source.items() if value})
        match = None if force_new else self.find_by_content_hash(content_hash)
        if match is not None:
            document_id, existing = match
        else:
            existing = None
            document_id = ""
            if origin == "manual":
                document_id = f"manual-{content_hash}"
                conflict = self.document_record(document_id)
                if force_new or (conflict is not None and self.document_origin(conflict) != "manual"):
                    document_id = f"manual-{content_hash[:32]}-{secrets.token_hex(4)}"
            elif suggested_id:
                document_id = suggested_id
            else:
                document_id = f"{origin}-{content_hash}"
            existing = self.document_record(document_id)
        sources = self._merge_sources(existing.get("sources") if existing else None, reference)
        target = self.download_dir / f"{document_id}.bin"
        if not target.is_file():
            target.write_bytes(content)
        entry = self.document_record(document_id) or {}
        previous_source = entry.get("source") if isinstance(entry.get("source"), dict) else None
        primary = reference
        status = str(entry.get("status", "registered")) if entry else "registered"
        self.set_document_status(
            document_id,
            status,
            filename=filename,
            origin=origin if not entry else self.document_origin(entry),
            source=source if source is not None else previous_source,
            content_hash=content_hash,
            size_bytes=len(content),
            mime_type=mime_type or "application/octet-stream",
            sources=sources,
            uploaded_at=primary["uploadedAt"],
        )
        entry = self.document_record(document_id) or {}
        return {
            "id": document_id,
            "filename": str(entry.get("filename", filename)),
            "status": str(entry.get("status", status)),
            "origin": self.document_origin(entry),
            "contentHash": content_hash,
            "sizeBytes": len(content),
            "mimeType": mime_type or "application/octet-stream",
            "uploadedAt": primary["uploadedAt"],
            "sources": sources,
            "source": entry.get("source") if isinstance(entry.get("source"), dict) else source,
        }

    def register_manual_document(self, content: bytes, filename: str, content_hash: str,
                                 mime_type: str, *, force_new: bool = False) -> dict[str, Any]:
        return self.register_document(
            content, filename, content_hash, mime_type,
            origin="manual", force_new=force_new,
        )

    def delete_document(self, document_id: str) -> None:
        entry = self.document_record(document_id)
        if entry is None:
            raise KeyError(document_id)
        origin = self.document_origin(entry)
        sources = entry.get("sources") if isinstance(entry.get("sources"), list) else []
        has_manual_source = any(
            isinstance(item, dict) and item.get("origin") == "manual" for item in sources
        )
        if origin not in {"manual", "demo"} and not has_manual_source:
            raise PermissionError(origin)
        documents = self.document_store.read()
        documents.pop(document_id, None)
        self.document_store.write(documents)
        self.delete_extractions(document_id)
        candidate = self.download_dir / f"{document_id}.bin"
        if candidate.is_file():
            try:
                candidate.unlink()
            except OSError:
                pass

    # Extracciones persistentes por documento y método
    def get_extraction(self, document_id: str, method: str) -> dict[str, Any] | None:
        extractions = self.extraction_store.read()
        doc = extractions.get(document_id) if isinstance(extractions.get(document_id), dict) else None
        if doc is None:
            return None
        m = doc.get(method) if isinstance(doc, dict) else None
        return m if isinstance(m, dict) else None

    def set_extraction(self, document_id: str, method: str, payload: dict[str, Any]) -> None:
        extractions = self.extraction_store.read()
        doc = extractions.get(document_id) if isinstance(extractions.get(document_id), dict) else {}
        doc[method] = payload
        extractions[document_id] = doc
        self.extraction_store.write(extractions)

    def remove_extraction(self, document_id: str, method: str) -> bool:
        extractions = self.extraction_store.read()
        doc = extractions.get(document_id) if isinstance(extractions.get(document_id), dict) else None
        if doc is None or method not in doc:
            return False
        doc.pop(method, None)
        if doc:
            extractions[document_id] = doc
        else:
            extractions.pop(document_id, None)
        self.extraction_store.write(extractions)
        return True

    def delete_extractions(self, document_id: str) -> None:
        extractions = self.extraction_store.read()
        if document_id in extractions:
            extractions.pop(document_id, None)
            self.extraction_store.write(extractions)

    def list_extractions(self, document_id: str) -> dict[str, dict[str, Any]]:
        extractions = self.extraction_store.read()
        doc = extractions.get(document_id) if isinstance(extractions.get(document_id), dict) else {}
        result: dict[str, dict[str, Any]] = {}
        for k, v in doc.items():
            if isinstance(v, dict):
                result[k] = v
        return result

    @staticmethod
    def _state_key(state: str) -> str:
        return hashlib.sha256(state.encode("utf-8")).hexdigest()
