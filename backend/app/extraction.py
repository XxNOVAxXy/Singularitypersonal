from datetime import datetime, timezone
from io import BytesIO
import json
import os
import re
import time
from typing import Any

from .config import settings


# Estas claves coinciden con shared/fieldDefinitions.ts para que la extracción
# local rellene los mismos controles que Gemini y la captura manual.
FIELD_DEFINITIONS = (
    ("policyNumber", "Número de póliza", "general", True,
     r"(?:p[oó]liza|policy)\s*(?:n[uú]mero|no\.?|#)?\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{3,})"),
    ("insurer", "Aseguradora", "general", True,
     r"(?:aseguradora|compa[nñ][ií]a de seguros)\s*[:\-]\s*([^\n|]{3,120})"),
    ("client", "Contratante", "general", True,
     r"(?:contratante|tomador|asegurado|titular|cliente)\s*[:\-]\s*([^\n|]{3,120})"),
    ("startDate", "Vigencia inicial", "general", True,
     r"(?:vigencia desde|fecha de inicio|inicio|vigencia inicial)\s*[:\-]\s*([^\n|]{4,40})"),
    ("endDate", "Vigencia final", "general", True,
     r"(?:vigencia hasta|fecha de vencimiento|vencimiento|fin|vigencia final)\s*[:\-]\s*([^\n|]{4,40})"),
    ("premium", "Prima total", "general", True,
     r"(?:prima total|prima neta|prima)\s*[:\-]\s*([^\n|]{2,60})"),
    ("currency", "Moneda", "general", False,
     r"(?:moneda|currency)\s*[:\-]\s*([A-Z$€£]{2,12})"),
    ("paymentMethod", "Forma de pago", "general", False,
     r"(?:forma de pago|frecuencia de pago|payment method)\s*[:\-]\s*([^\n|]{2,40})"),
    ("vehicleModel", "Marca y modelo", "specific", True,
     r"(?:marca y modelo|veh[ií]culo|modelo)\s*[:\-]\s*([^\n|]{3,100})"),
    ("vehiclePlates", "Placas", "specific", True,
     r"(?:placas|matr[ií]cula)\s*[:\-]\s*([A-Z0-9-]{3,20})"),
    ("vehicleVin", "Número de serie (VIN)", "specific", False,
     r"(?:n[uú]mero de serie|serie|VIN)\s*[:\-]\s*([A-HJ-NPR-Z0-9]{8,30})"),
    ("sumInsured", "Suma asegurada", "specific", True,
     r"(?:suma asegurada|l[ií]mite asegurado|monto asegurado|cobertura)\s*[:\-]\s*([^\n|]{2,70})"),
    ("deductible", "Deducible", "specific", False,
     r"(?:deducible|deductible)\s*[:\-]\s*([^\n|]{2,50})"),
    ("beneficiaries", "Beneficiarios", "specific", False,
     r"(?:beneficiarios|beneficiario)\s*[:\-]\s*([^\n|]{3,120})"),
    ("coverageLevel", "Nivel de cobertura", "specific", True,
     r"(?:nivel de cobertura|tipo de cobertura|plan)\s*[:\-]\s*([^\n|]{2,60})"),
    ("bondType", "Tipo de fianza", "specific", True,
     r"(?:tipo de fianza|fianza)\s*[:\-]\s*([^\n|]{2,60})"),
    ("bondedAmount", "Monto afianzado", "specific", True,
     r"(?:monto afianzado|importe afianzado)\s*[:\-]\s*([^\n|]{2,60})"),
    ("propertyAddress", "Ubicación del inmueble", "specific", False,
     r"(?:ubicaci[oó]n del inmueble|domicilio del inmueble|direcci[oó]n)\s*[:\-]\s*([^\n|]{3,160})"),
    ("receiptPeriod", "Periodo del recibo", "specific", True,
     r"(?:periodo del recibo|periodo|period)\s*[:\-]\s*([^\n|]{3,60})"),
    ("paidAmount", "Importe pagado", "specific", True,
     r"(?:importe pagado|monto pagado|total pagado)\s*[:\-]\s*([^\n|]{2,60})"),
    ("agentName", "Nombre del agente", "additional", False,
     r"(?:nombre del agente|agente)\s*[:\-]\s*([^\n|]{3,120})"),
    ("agencyCode", "Clave de agencia", "additional", False,
     r"(?:clave de agencia|c[oó]digo de agencia)\s*[:\-]\s*([^\n|]{2,50})"),
    ("observations", "Observaciones", "additional", False,
     r"(?:observaciones|notas|remarks)\s*[:\-]\s*([^\n|]{3,200})"),
)

SPECIFIC_KEYS_BY_POLICY = {
    "auto": {"vehicleModel", "vehiclePlates", "vehicleVin", "sumInsured", "deductible"},
    "gmm": {"sumInsured", "deductible", "beneficiaries", "coverageLevel"},
    "vida": {"sumInsured", "beneficiaries"},
    "fianza": {"bondType", "bondedAmount"},
    "danos": {"sumInsured", "deductible", "propertyAddress"},
    "recibo": {"receiptPeriod", "paidAmount"},
}

OCR_WARNING = "No fue posible ejecutar OCR local; instala PyMuPDF, Pillow, pytesseract y Tesseract."


def _is_pdf(filename: str, content: bytes, mime_type: str | None) -> bool:
    return mime_type == "application/pdf" or filename.lower().endswith(".pdf") or content.startswith(b"%PDF-")


def _ocr_image(image_bytes: bytes, warnings: list[str]) -> str:
    try:
        from PIL import Image
        import pytesseract

        image = Image.open(BytesIO(image_bytes))
        try:
            return pytesseract.image_to_string(image, lang=settings.ocr_language)
        except Exception:
            return pytesseract.image_to_string(image, lang="eng")
    except Exception:
        if OCR_WARNING not in warnings:
            warnings.append(OCR_WARNING)
        return ""


def _extract_pages(
    filename: str,
    content: bytes,
    mime_type: str | None,
    warnings: list[str],
) -> tuple[list[str], int]:
    if not _is_pdf(filename, content, mime_type):
        text = _ocr_image(content, warnings)
        return [text], 1

    try:
        try:
            import pymupdf as fitz
        except ImportError:
            import fitz

        document = fitz.open(stream=content, filetype="pdf")
        pages: list[str] = []
        for page in document:
            text = page.get_text("text") or ""
            if not text.strip():
                pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                text = _ocr_image(pixmap.tobytes("png"), warnings)
            pages.append(text)
        return pages, len(document)
    except Exception:
        # pypdf mantiene compatibilidad con instalaciones que aún no han
        # instalado PyMuPDF; los PDFs escaneados requerirán la dependencia OCR.
        try:
            from pypdf import PdfReader

            reader = PdfReader(BytesIO(content))
            pages = [page.extract_text() or "" for page in reader.pages]
            if not any(page.strip() for page in pages):
                warnings.append(OCR_WARNING)
            return pages, len(reader.pages)
        except Exception:
            warnings.append("No fue posible leer el PDF; verifica que no esté dañado.")
            return [], 0


def _clean_value(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = re.sub(r"\s+", " ", value).strip(" :;|\t\r\n")
    return cleaned or None


def _rules_fields(pages: list[str]) -> list[dict[str, Any]]:
    full_text = "\n".join(pages)
    fields: list[dict[str, Any]] = []
    for key, label, category, required, expression in FIELD_DEFINITIONS:
        value = None
        page_number = None
        for index, page_text in enumerate(pages, start=1):
            match = re.search(expression, page_text, re.IGNORECASE)
            if match:
                value = _clean_value(match.group(1))
                page_number = index
                break
        if value is None:
            match = re.search(expression, full_text, re.IGNORECASE)
            value = _clean_value(match.group(1)) if match else None
            page_number = 1 if value else None
        fields.append({
            "id": key,
            "key": key,
            "label": label,
            "value": value,
            "category": category,
            "required": required,
            "confidence": 91 if value else None,
            "status": "found" if value else "missing",
            "source": {"page": page_number, "snippet": value},
        })
    return fields


def _base_result(
    filename: str,
    pages: list[str],
    page_count: int,
    method: str,
    fields: list[dict[str, Any]],
    warnings: list[str],
) -> dict[str, Any]:
    text = "\n".join(pages)
    return {
        "document": {
            "fileName": filename,
            "pageCount": page_count,
            "textExtracted": bool(text.strip()),
        },
        "method": method,
        "policyType": _policy_type(text),
        "fields": fields,
        "additionalFields": [],
        "warnings": warnings,
        "extractedAt": datetime.now(timezone.utc).isoformat(),
    }


def _fields_for_policy(
    fields: list[dict[str, Any]],
    policy_type: str | None,
) -> list[dict[str, Any]]:
    if not policy_type or policy_type not in SPECIFIC_KEYS_BY_POLICY:
        return fields
    allowed = SPECIFIC_KEYS_BY_POLICY[policy_type]
    return [
        field for field in fields
        if field.get("category") != "specific" or field.get("key") in allowed
    ]


def extract_document(
    filename: str,
    content: bytes,
    method: str,
    mime_type: str | None = None,
    policy_type: str | None = None,
) -> dict[str, Any]:
    warnings: list[str] = []
    pages, page_count = _extract_pages(filename, content, mime_type, warnings)

    if method == "gemini" and settings.google_gemini_api_key:
        try:
            result = _extract_with_gemini(filename, content, mime_type, pages, page_count)
            result["fields"] = _fields_for_policy(result["fields"], policy_type)
            return result
        except Exception:
            warnings.append("Gemini no pudo completar el análisis; se aplicó extracción local como respaldo.")
    elif method == "gemini":
        warnings.append("Gemini no está configurado; se aplicó extracción local como respaldo.")

    return _base_result(
        filename,
        pages,
        page_count,
        "rules",
        _fields_for_policy(_rules_fields(pages), policy_type),
        warnings,
    )


def extract_pdf(filename: str, content: bytes, method: str) -> dict[str, Any]:
    """Compatibilidad para las rutas existentes de Gmail."""
    return extract_document(filename, content, method, "application/pdf")


def _extract_with_gemini(
    filename: str,
    content: bytes,
    mime_type: str | None,
    pages: list[str],
    page_count: int,
) -> dict[str, Any]:
    from google import genai
    from google.genai import types

    keys = ", ".join(key for key, *_ in FIELD_DEFINITIONS)
    prompt = f"""Analiza este documento de seguros o formulario. Devuelve exclusivamente JSON válido con esta forma:
{{"policy_type": string|null, "fields": {{{keys}}}, "additional_fields": [{{"key": string, "label": string, "value": string}}]}}
Extrae solo información explícita. Usa null cuando un campo no aparezca. Conserva fechas, monedas, identificadores y nombres tal como aparecen."""
    client = genai.Client(api_key=settings.google_gemini_api_key)
    last_error: Exception | None = None
    for model in settings.gemini_models:
        for attempt in range(2):
            try:
                response = client.models.generate_content(
                    model=model,
                    contents=[
                        types.Part.from_bytes(
                            data=content,
                            mime_type=mime_type or "application/pdf",
                        ),
                        prompt,
                    ],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        temperature=0,
                    ),
                )
                parsed = json.loads(response.text or "{}")
                values = parsed.get("fields", {}) if isinstance(parsed.get("fields", {}), dict) else {}
                fields = []
                for key, label, category, required, _ in FIELD_DEFINITIONS:
                    value = values.get(key)
                    value = _clean_value(str(value)) if value is not None else None
                    fields.append({
                        "id": key,
                        "key": key,
                        "label": label,
                        "value": value,
                        "category": category,
                        "required": required,
                        "confidence": 92 if value else None,
                        "status": "found" if value else "missing",
                        "source": {"page": 1 if value else None, "snippet": value},
                    })
                additional = parsed.get("additional_fields", [])
                if not isinstance(additional, list):
                    additional = []
                return {
                    **_base_result(filename, pages, page_count, "gemini", fields, []),
                    "policyType": parsed.get("policy_type") or _policy_type("\n".join(pages)),
                    "additionalFields": additional,
                }
            except Exception as error:
                last_error = error
                message = str(error).lower()
                if "quota" in message or "daily" in message or "per day" in message:
                    raise
                if attempt == 0 and ("429" in message or "503" in message or "unavailable" in message):
                    time.sleep(2)
                    continue
                break
    if last_error:
        raise last_error
    raise RuntimeError("No hay modelos Gemini configurados")


def _policy_type(text: str) -> str | None:
    lowered = text.lower()
    for term, label in (
        ("responsabilidad civil", "Responsabilidad civil"),
        ("vida", "Vida"),
        ("automóvil", "Automóviles"),
        ("auto", "Automóviles"),
        ("salud", "Salud"),
        ("hogar", "Hogar"),
        ("transporte", "Transporte"),
    ):
        if term in lowered:
            return label
    return "Póliza" if re.search(r"p[oó]liza|seguro|asegurad", lowered) else None
