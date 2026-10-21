"""Pruebas de integración de las rutas nuevas de documentos (FastAPI).

Se ejecutan solo si el entorno tiene FastAPI instalado. Si faltan dependencias
no se instala nada: se informa mediante una línea ``SKIP:`` y se sale con 0,
de modo que el runner de Node pueda omitir la prueba de forma reproducible.
"""

import hashlib
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _missing_dependencies() -> str | None:
    try:
        import fastapi  # noqa: F401
        import starlette  # noqa: F401
        from fastapi.testclient import TestClient  # noqa: F401
    except Exception as error:  # pragma: no cover - depende del entorno
        return f"{type(error).__name__}: {error}"
    try:
        import app.main  # noqa: F401
    except Exception as error:  # pragma: no cover - depende del entorno
        return f"import app.main -> {type(error).__name__}: {error}"
    return None


def run() -> int:
    missing = _missing_dependencies()
    if missing is not None:
        print(f"SKIP: dependencias FastAPI no disponibles ({missing})")
        return 0

    from fastapi.testclient import TestClient

    import app.main as main_module
    from app.storage import GmailStorage

    with tempfile.TemporaryDirectory() as tmp:
        main_module.storage = GmailStorage(Path(tmp))
        client = TestClient(main_module.app)

        content = b"%PDF-1.4 documento de integracion"
        upload = {"file": ("poliza.pdf", content, "application/pdf")}
        created = client.post("/api/documents", files=upload)
        assert created.status_code == 200, created.text
        document = created.json()
        document_id = document["id"]
        assert document["origin"] == "manual"
        assert document["id"] == f"manual-{hashlib.sha256(content).hexdigest()}"

        # Deduplicación por contenido: misma subida -> mismo ID.
        again = client.post("/api/documents", files=upload)
        assert again.status_code == 200
        assert again.json()["id"] == document_id
        assert len(again.json()["sources"]) == 2

        listed = client.get("/api/documents")
        assert listed.status_code == 200
        assert any(item["id"] == document_id for item in listed.json()["documents"])

        # Persistencia independiente por método.
        manual = client.put(
            f"/api/documents/{document_id}/extractions/manual",
            json={"fields": [{"key": "policy_number", "value": "1"}], "updatedAt": "t1"},
        )
        assert manual.status_code == 200, manual.text
        gemini = client.put(
            f"/api/documents/{document_id}/extractions/gemini",
            json={"fields": [{"key": "policy_number", "value": "2"}], "updatedAt": "t2"},
        )
        assert gemini.status_code == 200
        fetched = client.get(f"/api/documents/{document_id}/extractions").json()["extractions"]
        assert set(fetched) == {"manual", "gemini"}

        # Re-ejecutar Gemini actualiza solo su resultado.
        client.put(
            f"/api/documents/{document_id}/extractions/gemini",
            json={"fields": [{"key": "policy_number", "value": "3"}], "updatedAt": "t3"},
        )
        fetched = client.get(f"/api/documents/{document_id}/extractions").json()["extractions"]
        assert fetched["manual"]["fields"][0]["value"] == "1"
        assert fetched["gemini"]["fields"][0]["value"] == "3"

        # Eliminar la extracción Gemini preserva la manual.
        client.delete(f"/api/documents/{document_id}/extractions/gemini")
        fetched = client.get(f"/api/documents/{document_id}/extractions").json()["extractions"]
        assert "manual" in fetched and "gemini" not in fetched

        # Gmail está protegido en el backend.
        main_module.storage.set_document_status(
            "gmail-fingerprint", "extracted", origin="gmail", filename="g.pdf",
        )
        protected = client.delete("/api/documents/gmail-fingerprint")
        assert protected.status_code == 403, protected.text
        assert main_module.storage.document_record("gmail-fingerprint") is not None

        # La ruta de Gmail expone origen y metadatos para el modo degradado.
        gmail_list = client.get("/api/gmail/documents")
        assert gmail_list.status_code == 200
        by_id = {item["id"]: item for item in gmail_list.json()["documents"]}
        assert by_id["gmail-fingerprint"]["origin"] == "gmail"
        assert by_id[document_id]["origin"] == "manual"
        assert by_id[document_id]["contentHash"] == hashlib.sha256(content).hexdigest()
        assert by_id[document_id]["sizeBytes"] == len(content)

        # Registro antiguo sin origin ni source: también protegido.
        main_module.storage.set_document_status("legacy-gmail", "processing", filename="old.pdf")
        legacy = client.delete("/api/documents/legacy-gmail")
        assert legacy.status_code == 403, legacy.text
        assert main_module.storage.document_record("legacy-gmail") is not None

        # Un documento manual permitido se elimina junto con sus extracciones.
        removed = client.delete(f"/api/documents/{document_id}")
        assert removed.status_code == 200, removed.text
        assert main_module.storage.document_record(document_id) is None
        assert main_module.storage.list_extractions(document_id) == {}

        # --- Extracción IMAP simulada (sin conexión real) ---
        imap_pdf = b"%PDF-1.4 adjunto imap simulado"

        class _FakeImap:
            def download_attachment(self, account, message_id, attachment_id):
                return imap_pdf, "poliza-imap.pdf", "application/pdf"

        class _FakeImapStorage:
            def get_account(self, account_id, owner_id=None):
                return {"id": account_id, "host": "imap.example.com"} if account_id == "acc-ok" else None

        def _fake_extract(filename, content, method, mime_type=None, policy_type=None):
            return {
                "document": {"fileName": filename, "pageCount": 1, "textExtracted": True},
                "method": method,
                "policyType": "Automóviles",
                "fields": [{"key": "policy_number", "label": "Póliza", "value": "IMAP-1"}],
                "additionalFields": [],
                "warnings": [],
                "extractedAt": "2026-01-01T00:00:00+00:00",
            }

        real_imap, real_imap_storage = main_module.imap, main_module.imap_storage
        real_extract = main_module.extract_document
        main_module.imap, main_module.imap_storage = _FakeImap(), _FakeImapStorage()
        main_module.extract_document = _fake_extract
        try:
            extracted = client.post(
                "/api/imap/attachments/msg-1/part-3/extract",
                params={"account_id": "acc-ok", "method": "rules"},
            )
            assert extracted.status_code == 200, extracted.text
            payload = extracted.json()
            imap_hash = hashlib.sha256(imap_pdf).hexdigest()
            assert payload["documentId"] == f"imap-{imap_hash}"
            assert payload["documentStatus"] == "extracted"
            assert payload["source"]["accountId"] == "acc-ok"

            # El documento queda en el catálogo unificado con origen imap.
            listed = client.get("/api/documents").json()["documents"]
            record = next(item for item in listed if item["id"] == payload["documentId"])
            assert record["origin"] == "imap"

            # Reejecutar la extracción reutiliza el registro (no duplica).
            again = client.post(
                "/api/imap/attachments/msg-1/part-3/extract",
                params={"account_id": "acc-ok", "method": "rules"},
            )
            assert again.status_code == 200
            assert again.json()["documentId"] == payload["documentId"]
            count_imap = sum(1 for item in client.get("/api/documents").json()["documents"]
                             if item["id"] == payload["documentId"])
            assert count_imap == 1

            # El archivo servido por /api/documents/{id}/file funciona para imap.
            file_response = client.get(f"/api/documents/{payload['documentId']}/file")
            assert file_response.status_code == 200
            assert file_response.content == imap_pdf

            # Los adjuntos del mensaje muestran el estado de extracción.
            class _FakeImapList:
                def list_messages(self, account, folder, limit):
                    return [{"id": "msg-1", "attachments": [{"id": "part-3", "name": "poliza-imap.pdf"}]}]

            main_module.imap = _FakeImapList()
            messages = client.get("/api/imap/messages", params={"account_id": "acc-ok"}).json()
            assert messages["messages"][0]["attachments"][0]["extractionStatus"] == "extracted"

            # Un documento IMAP no se puede eliminar.
            protected = client.delete(f"/api/documents/{payload['documentId']}")
            assert protected.status_code == 403, protected.text
        finally:
            main_module.imap, main_module.imap_storage = real_imap, real_imap_storage
            main_module.extract_document = real_extract

    print("api documents tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(run())
