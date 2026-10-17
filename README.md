# Singularity

Workspace para revisión y extracción de pólizas. Esta versión integra lo mejor de las dos implementaciones:

- UI responsive, routing, formularios de revisión, comparación y configuración de `NovaSingularity`.
- Gmail real con OAuth PKCE, bandeja recibidos/enviados, adjuntos, previsualización, descarga y caché de `Singularity_1`.
- Extracción Gemini con validación de entrada, errores tipados, pruebas y fallback local.

## Desarrollo

Frontend y servicio Gemini:

```bash
npm install
npm run dev:server
npm run dev
```

Gmail requiere Python:

```bash
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --port 8000
```

Después de crear el entorno virtual, puedes ejecutar los tres procesos juntos con `npm run dev:all`; no es necesario activar el entorno virtual porque el script usa directamente `.venv\\Scripts\\python.exe`.

Configura `.env` a partir de `.env.example`. Para OAuth, Google debe tener registrada exactamente:
`http://localhost:8000/api/auth/callback/google`.

## Verificación

```bash
npm run build
npm test
```

El backend guarda tokens y adjuntos en `backend/data/`, una carpeta excluida de Git. Cuando Gmail no está conectado, la bandeja muestra datos demo para permitir revisar la interfaz sin credenciales.
