# Prueba local de IMAP con GreenMail

## Iniciar el servidor

Desde la raíz del proyecto:

```bash
docker compose up -d greenmail
```

Para permitir IMAP sin cifrado únicamente en el entorno local, agrega temporalmente al `.env`:

```dotenv
IMAP_ALLOW_INSECURE_LOCAL=true
```

Reinicia el backend Python después de cambiar esa variable. En producción debe usarse `SSL/TLS` o `STARTTLS` con un certificado válido.

## Cuentas de prueba

| Cuenta | Usuario IMAP | Contraseña | Servidor | Puerto | Seguridad |
| --- | --- | --- | --- | ---: | --- |
| `ventas@empresa.test` | `ventas` | `ventas123` | `127.0.0.1` | `3143` | Sin cifrado, solo local |
| `administracion@empresa.test` | `administracion` | `admin123` | `127.0.0.1` | `3143` | Sin cifrado, solo local |

El puerto SMTP local es `3025` y el IMAPS de GreenMail es `3993`.

## Generar mensajes reales

Con GreenMail ejecutándose:

```bash
python scripts/send_greenmail_messages.py
```

El script entrega un mensaje a cada cuenta con texto plano, HTML y `prueba-singularity.pdf`. No modifica la bandeja de Singularity ni crea mensajes ficticios en el frontend.

## Verlos en Singularity

1. Inicia el backend Python y el frontend.
2. Abre `Configuración > Integraciones`.
3. Pulsa `Agregar cuenta` en `Correos empresariales`.
4. Usa los datos de la tabla y pulsa `Probar conexión`.
5. Pulsa `Guardar y conectar`.
6. Abre `Correos`, selecciona la cuenta en el selector y abre `INBOX`.
7. Pulsa `Actualizar` si el mensaje se generó después de conectar.

## Usar un servidor real

Selecciona `SSL/TLS` para el puerto 993 o `STARTTLS` para el puerto 143, introduce el host real, usuario y contraseña de aplicación cuando el proveedor lo requiera. No uses `Sin cifrado` fuera de loopback. La contraseña se almacena cifrada en SQLite en el servidor y nunca se devuelve al navegador.

Si el servidor real está en una red privada, agrega su nombre exacto a `IMAP_ALLOWED_HOSTS`; no abras una allowlist amplia ni aceptes URLs completas. En producción configura una clave Fernet estable en `IMAP_CREDENTIAL_KEY` y conserva ese secreto junto con `backend/data/` para poder descifrar las cuentas después de reiniciar o restaurar un respaldo.

La autenticación se guarda con `auth_method=password` para que el esquema pueda incorporar OAuth por proveedor posteriormente sin cambiar la cuenta ni la bandeja.
