# Backend integrado de Singularity

Este backend conserva las credenciales OAuth, los tokens y los adjuntos de Gmail fuera del frontend. Expone:

- `GET /api/auth/google` y `GET /api/auth/callback/google` para OAuth con Gmail.
- `GET /api/gmail/status`, `/api/gmail/messages` y `/api/gmail/messages/{id}` para la bandeja.
- `GET /api/gmail/documents` para consultar el historial persistido de extracciones.
- `GET /api/gmail/documents/{id}/file` para abrir una extracción ya cacheada.
- `GET /api/gmail/attachments/{message}/{attachment}` para previsualizar o descargar archivos.
- `POST /api/gmail/attachments/{message}/{attachment}/extract` para extraer un PDF.
- `POST /api/extractions/{method}` para extracción directa de PDFs.

## Configuración

1. Crea un entorno virtual e instala `backend/requirements.txt`.
2. Copia `.env.example` a `.env` y completa las credenciales de Google.
3. Registra exactamente `http://localhost:8000/api/auth/callback/google` como URI autorizada.
4. Ejecuta `npm run dev:all` para iniciar cliente, extracción Gemini y Gmail.

La carpeta `backend/data/` contiene tokens, estados y archivos descargados; está excluida de Git.
