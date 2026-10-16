from __future__ import annotations

from datetime import datetime, timezone
import json
import os
from pathlib import Path
import secrets
import sqlite3
from typing import Any
from uuid import uuid4

from cryptography.fernet import Fernet, InvalidToken


LOCAL_OWNER_ID = "local-user"


class ImapStorageError(RuntimeError):
    pass


class ImapStorage:
    def __init__(self, data_dir: Path, encryption_key: str | None = None) -> None:
        data_dir.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(data_dir, 0o700)
        except OSError:
            pass
        self.database_path = data_dir / "imap.sqlite3"
        self.key_path = data_dir / ".imap-credentials.key"
        self.cipher = Fernet(self._load_key(encryption_key))
        self._initialize()

    def _load_key(self, configured: str | None) -> bytes:
        if configured:
            try:
                Fernet(configured.encode("ascii"))
            except (ValueError, TypeError, UnicodeError):
                raise ImapStorageError("IMAP_CREDENTIAL_KEY no es una clave Fernet válida")
            return configured.encode("ascii")

        try:
            key = self.key_path.read_bytes().strip()
            Fernet(key)
            return key
        except (OSError, ValueError, TypeError):
            if self.database_path.exists() and self._has_accounts():
                raise ImapStorageError(
                    "La clave de cifrado IMAP no está disponible; restaura IMAP_CREDENTIAL_KEY o su archivo protegido"
                )
            key = Fernet.generate_key()
            temporary_path = self.key_path.with_suffix(".tmp")
            temporary_path.write_bytes(key)
            try:
                os.chmod(temporary_path, 0o600)
            except OSError:
                pass
            os.replace(temporary_path, self.key_path)
            try:
                os.chmod(self.key_path, 0o600)
            except OSError:
                pass
            return key

    def _has_accounts(self) -> bool:
        try:
            with sqlite3.connect(self.database_path) as connection:
                row = connection.execute("SELECT 1 FROM imap_accounts LIMIT 1").fetchone()
            return row is not None
        except sqlite3.Error:
            return False

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=10)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS imap_accounts (
                    id TEXT PRIMARY KEY,
                    owner_id TEXT NOT NULL,
                    label TEXT NOT NULL,
                    email TEXT NOT NULL,
                    username TEXT NOT NULL,
                    host TEXT NOT NULL,
                    port INTEGER NOT NULL,
                    security TEXT NOT NULL,
                    auth_method TEXT NOT NULL,
                    secret BLOB NOT NULL,
                    status TEXT NOT NULL DEFAULT 'unknown',
                    last_error TEXT,
                    last_checked TEXT,
                    folders_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )

    def _encrypt_secret(self, password: str) -> bytes:
        return self.cipher.encrypt(password.encode("utf-8"))

    def _decrypt_secret(self, value: bytes) -> str:
        try:
            return self.cipher.decrypt(value).decode("utf-8")
        except (InvalidToken, UnicodeDecodeError) as error:
            raise ImapStorageError("No se pudo descifrar la credencial IMAP") from error

    @staticmethod
    def _public(row: sqlite3.Row) -> dict[str, Any]:
        folders = json.loads(str(row["folders_json"]))
        return {
            "id": row["id"],
            "label": row["label"],
            "email": row["email"],
            "username": row["username"],
            "host": row["host"],
            "port": row["port"],
            "security": row["security"],
            "authMethod": row["auth_method"],
            "status": row["status"],
            "lastError": row["last_error"],
            "lastChecked": row["last_checked"],
            "folders": folders if isinstance(folders, list) else [],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def _config(self, row: sqlite3.Row) -> dict[str, Any]:
        result = self._public(row)
        result["password"] = self._decrypt_secret(row["secret"])
        return result

    def list_accounts(self, owner_id: str = LOCAL_OWNER_ID) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT * FROM imap_accounts WHERE owner_id = ? ORDER BY label COLLATE NOCASE",
                (owner_id,),
            ).fetchall()
        return [self._public(row) for row in rows]

    def get_account(self, account_id: str, owner_id: str = LOCAL_OWNER_ID) -> dict[str, Any] | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT * FROM imap_accounts WHERE id = ? AND owner_id = ?",
                (account_id, owner_id),
            ).fetchone()
        return self._config(row) if row else None

    def create_account(
        self,
        values: dict[str, Any],
        password: str,
        owner_id: str = LOCAL_OWNER_ID,
    ) -> dict[str, Any]:
        account_id = uuid4().hex
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO imap_accounts
                (id, owner_id, label, email, username, host, port, security,
                 auth_method, secret, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    account_id,
                    owner_id,
                    values["label"],
                    values["email"],
                    values["username"],
                    values["host"],
                    values["port"],
                    values["security"],
                    values.get("authMethod", "password"),
                    self._encrypt_secret(password),
                    now,
                    now,
                ),
            )
        return self.get_account(account_id, owner_id) or {}

    def update_account(
        self,
        account_id: str,
        values: dict[str, Any],
        password: str | None,
        owner_id: str = LOCAL_OWNER_ID,
    ) -> dict[str, Any] | None:
        current = self.get_account(account_id, owner_id)
        if current is None:
            return None
        now = datetime.now(timezone.utc).isoformat()
        secret = self._encrypt_secret(password) if password else self._encrypt_secret(current["password"])
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE imap_accounts SET label = ?, email = ?, username = ?, host = ?,
                    port = ?, security = ?, auth_method = ?, secret = ?, status = 'unknown',
                    last_error = NULL, last_checked = NULL, folders_json = '[]', updated_at = ?
                WHERE id = ? AND owner_id = ?
                """,
                (
                    values["label"],
                    values["email"],
                    values["username"],
                    values["host"],
                    values["port"],
                    values["security"],
                    values.get("authMethod", "password"),
                    secret,
                    now,
                    account_id,
                    owner_id,
                ),
            )
        return self.get_account(account_id, owner_id)

    def delete_account(self, account_id: str, owner_id: str = LOCAL_OWNER_ID) -> bool:
        with self._connect() as connection:
            result = connection.execute(
                "DELETE FROM imap_accounts WHERE id = ? AND owner_id = ?",
                (account_id, owner_id),
            )
        return result.rowcount > 0

    def save_status(
        self,
        account_id: str,
        status: str,
        folders: list[str] | None = None,
        error: str | None = None,
        owner_id: str = LOCAL_OWNER_ID,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            connection.execute(
                """
                UPDATE imap_accounts SET status = ?, last_error = ?, last_checked = ?,
                    folders_json = COALESCE(?, folders_json), updated_at = ?
                WHERE id = ? AND owner_id = ?
                """,
                (
                    status,
                    error,
                    now,
                    json.dumps(folders) if folders is not None else None,
                    now,
                    account_id,
                    owner_id,
                ),
            )
