from dataclasses import dataclass
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parents[2]
load_dotenv(ROOT_DIR / ".env")


@dataclass(frozen=True)
class Settings:
    google_client_id: str = os.getenv("GOOGLE_CLIENT_ID", "")
    google_client_secret: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    google_redirect_uri: str = os.getenv(
        "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/callback/google"
    )
    google_gemini_api_key: str = os.getenv("GOOGLE_GEMINI_API_KEY", "") or os.getenv("GEMINI_API_KEY", "")
    google_gemini_model: str = os.getenv("GOOGLE_GEMINI_MODEL", os.getenv("GEMINI_MODEL", "gemini-3.8-flash"))
    google_gemini_fallback_models: tuple[str, ...] = tuple(
        model.strip()
        for model in os.getenv("GOOGLE_GEMINI_FALLBACK_MODELS", os.getenv("GEMINI_FALLBACK_MODELS", "")).split(",")
        if model.strip()
    )
    ocr_language: str = os.getenv("OCR_LANGUAGE", "spa+eng")
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    imap_timeout_seconds: int = int(os.getenv("IMAP_TIMEOUT_SECONDS", "15"))
    imap_allow_insecure_local: bool = os.getenv("IMAP_ALLOW_INSECURE_LOCAL", "false").lower() == "true"
    imap_credential_key: str | None = os.getenv("IMAP_CREDENTIAL_KEY") or None
    imap_allowed_hosts: tuple[str, ...] = tuple(
        host.strip().lower()
        for host in os.getenv("IMAP_ALLOWED_HOSTS", "").split(",")
        if host.strip()
    )
    data_dir: Path = ROOT_DIR / "backend" / "data"

    @property
    def gemini_models(self) -> tuple[str, ...]:
        return tuple(dict.fromkeys((self.google_gemini_model, *self.google_gemini_fallback_models)))

    def get_gemini_api_key(self) -> str:
        persisted_file = ROOT_DIR / "server" / "data" / "gemini-settings.json"
        try:
            with persisted_file.open("r", encoding="utf-8") as file:
                value = json.load(file).get("apiKey")
            if isinstance(value, str) and value.strip():
                return value.strip()
        except (OSError, ValueError, AttributeError):
            pass
        return self.google_gemini_api_key

    def require_google_oauth(self) -> None:
        missing = [
            name
            for name, value in (
                ("GOOGLE_CLIENT_ID", self.google_client_id),
                ("GOOGLE_CLIENT_SECRET", self.google_client_secret),
                ("GOOGLE_REDIRECT_URI", self.google_redirect_uri),
            )
            if not value
        ]
        if missing:
            raise RuntimeError("Faltan variables de entorno de Google: " + ", ".join(missing))
        redirect = urlparse(self.google_redirect_uri)
        if (
            redirect.scheme not in {"http", "https"}
            or not redirect.netloc
            or redirect.path != "/api/auth/callback/google"
            or redirect.query
            or redirect.fragment
        ):
            raise RuntimeError(
                "GOOGLE_REDIRECT_URI debe apuntar exactamente a /api/auth/callback/google"
            )


settings = Settings()
