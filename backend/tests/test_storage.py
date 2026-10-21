"""Pruebas del almacenamiento JSON sin dependencias externas (solo stdlib).

Se ejecuta tanto con ``python backend/tests/test_storage.py`` como desde el
runner de Node (``npm test``) mediante un subproceso.
"""

import hashlib
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.storage import GmailStorage  # noqa: E402


def run() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        storage = GmailStorage(Path(tmp))

        content = b"%PDF-1.4 contenido de prueba"
        content_hash = hashlib.sha256(content).hexdigest()

        document = storage.register_manual_document(
            content, "poliza.pdf", content_hash, "application/pdf",
        )
        assert document["origin"] == "manual"
        assert document["id"] == f"manual-{content_hash}"
        assert document["contentHash"] == content_hash
        assert document["sizeBytes"] == len(content)

        # Deduplicación por contenido: mismo hash -> mismo ID, se acumulan fuentes.
        duplicate = storage.register_manual_document(
            content, "copia.pdf", content_hash, "application/pdf",
        )
        assert duplicate["id"] == document["id"]
        assert len(duplicate["sources"]) == 2
        assert {item["filename"] for item in duplicate["sources"]} == {"poliza.pdf", "copia.pdf"}

        # force_new crea un registro independiente aunque el contenido coincida.
        separate = storage.register_manual_document(
            content, "otra.pdf", content_hash, "application/pdf", force_new=True,
        )
        assert separate["id"] != document["id"]

        # Extracciones independientes por método.
        manual_fields = [{"key": "policy_number", "value": "123"}]
        gemini_fields = [{"key": "policy_number", "value": "456"}]
        storage.set_extraction(document["id"], "manual", {"fields": manual_fields, "updatedAt": "t1"})
        storage.set_extraction(document["id"], "gemini", {"fields": gemini_fields, "updatedAt": "t2"})
        assert storage.get_extraction(document["id"], "manual")["fields"] == manual_fields
        assert storage.get_extraction(document["id"], "gemini")["fields"] == gemini_fields

        # Re-ejecutar Gemini no toca la captura manual.
        storage.set_extraction(document["id"], "gemini", {"fields": [{"key": "x"}], "updatedAt": "t3"})
        assert storage.get_extraction(document["id"], "manual")["fields"] == manual_fields

        # Eliminar Gemini preserva manual.
        assert storage.remove_extraction(document["id"], "gemini") is True
        assert storage.get_extraction(document["id"], "gemini") is None
        assert storage.get_extraction(document["id"], "manual") is not None

        # Gmail está protegido contra la eliminación y su archivo queda intacto.
        storage.set_document_status("gmail-fingerprint", "extracted", origin="gmail", filename="g.pdf")
        shared_file = storage.download_dir / "gmail-fingerprint.bin"
        shared_file.write_bytes(b"archivo compartido de Gmail")
        try:
            storage.delete_document("gmail-fingerprint")
            raise AssertionError("La eliminación de Gmail debía fallar")
        except PermissionError:
            pass
        assert storage.document_record("gmail-fingerprint") is not None
        assert shared_file.is_file()
        assert shared_file.read_bytes() == b"archivo compartido de Gmail"

        # Registros Gmail antiguos: sin origin pero con procedencia de correo.
        storage.set_document_status(
            "gmail-legacy-source",
            "extracted",
            source={"messageId": "m1", "attachmentId": "a1"},
            filename="legacy.pdf",
        )
        assert storage.document_origin(storage.document_record("gmail-legacy-source")) == "gmail"
        try:
            storage.delete_document("gmail-legacy-source")
            raise AssertionError("La eliminación de Gmail antiguo debía fallar")
        except PermissionError:
            pass

        # Registro sin origin ni procedencia: se protege por defecto (fail closed).
        storage.set_document_status("sin-origen", "processing", filename="x.pdf")
        assert storage.document_origin(storage.document_record("sin-origen")) == "gmail"
        try:
            storage.delete_document("sin-origen")
            raise AssertionError("Un registro sin origen no debía eliminarse")
        except PermissionError:
            pass

        # Un documento manual sí se elimina, junto con su archivo y extracciones.
        download_path = storage.download_dir / f"{document['id']}.bin"
        assert download_path.is_file()
        storage.delete_document(document["id"])
        assert storage.document_record(document["id"]) is None
        assert not download_path.is_file()
        assert storage.list_extractions(document["id"]) == {}

        # Eliminar un documento inexistente falla explícitamente.
        try:
            storage.delete_document("no-existe")
            raise AssertionError("La eliminación de un documento inexistente debía fallar")
        except KeyError:
            pass

        # --- Registro unificado entre orígenes ---
        shared = b"%PDF-1.4 mismo contenido dos origenes"
        shared_hash = hashlib.sha256(shared).hexdigest()

        # Primero llega por Gmail: id = fingerprint sugerido, protegido.
        gmail_doc = storage.register_document(
            shared, "poliza-gmail.pdf", shared_hash, "application/pdf",
            origin="gmail", source={"messageId": "m9", "attachmentId": "a9"},
            suggested_id="fp-gmail-1",
        )
        assert gmail_doc["id"] == "fp-gmail-1"
        assert gmail_doc["origin"] == "gmail"

        # El mismo PDF por IMAP fusiona en el registro existente.
        imap_doc = storage.register_document(
            shared, "poliza-imap.pdf", shared_hash, "application/pdf",
            origin="imap",
            source={"accountId": "acc-1", "messageId": "m9", "attachmentId": "a9"},
        )
        assert imap_doc["id"] == "fp-gmail-1"
        assert imap_doc["origin"] == "gmail"
        assert len(imap_doc["sources"]) == 2
        assert {item["origin"] for item in imap_doc["sources"]} == {"gmail", "imap"}

        # La referencia de correo no se duplica al reenviar el mismo adjunto.
        again_source = storage.register_document(
            shared, "poliza-imap.pdf", shared_hash, "application/pdf",
            origin="imap",
            source={"accountId": "acc-1", "messageId": "m9", "attachmentId": "a9"},
        )
        assert len(again_source["sources"]) == 2

        # document_by_source encuentra el registro unificado.
        found = storage.document_by_source(message_id="m9", attachment_id="a9", account_id="acc-1")
        assert found is not None and found["id"] == "fp-gmail-1"
        assert storage.find_by_content_hash(shared_hash)[0] == "fp-gmail-1"

        # --- Búsqueda por cualquier referencia conservada en `sources` ---
        # Llega primero por IMAP y después por Gmail: la fuente principal pasa a
        # ser la de Gmail y la de IMAP queda solo dentro de `sources`.
        r2_content = b"%PDF-1.4 mismo pdf por imap y gmail"
        r2_hash = hashlib.sha256(r2_content).hexdigest()
        r2_imap = {"accountId": "acc-r2", "messageId": "m-r2", "attachmentId": "a-r2"}
        r2_gmail = {"messageId": "m-r2", "attachmentId": "a-r2"}

        r2_first = storage.register_document(
            r2_content, "imap-r2.pdf", r2_hash, "application/pdf",
            origin="imap", source=r2_imap, suggested_id="fp-r2",
        )
        r2_second = storage.register_document(
            r2_content, "gmail-r2.pdf", r2_hash, "application/pdf",
            origin="gmail", source=r2_gmail,
        )

        # No se crea un segundo documento: se fusionan las fuentes.
        assert r2_first["id"] == "fp-r2"
        assert r2_second["id"] == r2_first["id"]
        assert len([
            entry for _, entry in storage.document_records()
            if entry.get("contentHash") == r2_hash
        ]) == 1
        assert len(r2_second["sources"]) == 2

        # La fuente principal conserva la última registración; la de IMAP queda
        # únicamente en `sources`.
        r2_entry = storage.document_record("fp-r2")
        assert r2_entry["source"]["messageId"] == "m-r2"
        assert "accountId" not in r2_entry["source"]

        # Ambas referencias siguen siendo localizables.
        assert storage.document_by_source(
            message_id="m-r2", attachment_id="a-r2", account_id="acc-r2",
        )["id"] == "fp-r2"
        assert storage.document_by_source(
            message_id="m-r2", attachment_id="a-r2",
        )["id"] == "fp-r2"
        assert storage.document_by_source(
            account_id="acc-r2", message_id="m-r2", attachment_id="a-r2",
        )["id"] == "fp-r2"

        # Una referencia que no pertenece al documento no lo localiza.
        assert storage.document_by_source(
            message_id="m-r2", attachment_id="a-r2", account_id="acc-otra",
        ) is None
        assert storage.document_by_source(message_id="m-inexistente") is None
        assert storage.document_by_source() is None

        # El documento fusionado sigue siendo el único con ese contenido.
        assert storage.find_by_content_hash(r2_hash)[0] == "fp-r2"

        # IMAP puro está protegido contra la eliminación.
        imap_only = b"%PDF-1.4 solo imap"
        imap_only_hash = hashlib.sha256(imap_only).hexdigest()
        storage.register_document(
            imap_only, "solo-imap.pdf", imap_only_hash, "application/pdf",
            origin="imap", source={"accountId": "acc-2", "messageId": "m2", "attachmentId": "a2"},
        )
        try:
            storage.delete_document(f"imap-{imap_only_hash}")
            raise AssertionError("La eliminación de un documento IMAP debía fallar")
        except PermissionError:
            pass

        # Una fuente manual hace borrable el documento aunque su origen sea Gmail.
        manual_first = b"%PDF-1.4 manual luego correo"
        manual_first_hash = hashlib.sha256(manual_first).hexdigest()
        merged = storage.register_document(
            manual_first, "subido.pdf", manual_first_hash, "application/pdf",
            origin="manual",
        )
        merged_gmail = storage.register_document(
            manual_first, "reenviado.pdf", manual_first_hash, "application/pdf",
            origin="gmail", source={"messageId": "mX", "attachmentId": "aX"},
            suggested_id="fp-reenviado",
        )
        assert merged_gmail["id"] == merged["id"]
        assert merged_gmail["origin"] == "manual"
        storage.delete_document(merged["id"])
        assert storage.document_record(merged["id"]) is None

    print("storage tests passed")


if __name__ == "__main__":
    run()
