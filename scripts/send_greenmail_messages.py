from __future__ import annotations

from email.message import EmailMessage
import os
import smtplib


SMTP_HOST = os.getenv("GREENMAIL_SMTP_HOST", "127.0.0.1")
SMTP_PORT = int(os.getenv("GREENMAIL_SMTP_PORT", "3025"))
SENDER = "notificaciones@empresa.test"


def sample_pdf() -> bytes:
    return b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 58 >>
stream
BT /F1 18 Tf 72 720 Td (Documento de prueba GreenMail) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
trailer
<< /Root 1 0 R >>
%%EOF
"""


def build_message(recipient: str) -> EmailMessage:
    message = EmailMessage()
    message["From"] = SENDER
    message["To"] = recipient
    message["Subject"] = "Prueba IMAP de Singularity"
    message.set_content(
        "Este mensaje confirma que la cuenta empresarial IMAP recibió contenido de texto."
    )
    message.add_alternative(
        "<html><body><h1>Prueba IMAP</h1><p>Contenido HTML recibido por GreenMail.</p></body></html>",
        subtype="html",
    )
    message.add_attachment(
        sample_pdf(),
        maintype="application",
        subtype="pdf",
        filename="prueba-singularity.pdf",
    )
    return message


def main() -> None:
    recipients = ("ventas@empresa.test", "administracion@empresa.test")
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as smtp:
        for recipient in recipients:
            smtp.send_message(build_message(recipient))
            print(f"Mensaje enviado a {recipient}")


if __name__ == "__main__":
    main()
