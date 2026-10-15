import hashlib
import json
import os
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
        documents = self.document_store.read()
        documents.setdefault(fingerprint, {"status": "pending", "filename": filename})
        self.document_store.write(documents)

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
                            source: dict[str, Any] | None = None) -> None:
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
    def _state_key(state: str) -> str:
        return hashlib.sha256(state.encode("utf-8")).hexdigest()
