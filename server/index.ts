import { createApp } from './app.ts'
import { env } from './config/env.ts'

const app = createApp()

const server = app.listen(env.port, env.host, () => {
  console.log(`[server] escuchando en http://${env.host}:${env.port}`)
  if (!env.geminiApiKey) {
    console.warn(
      '[server] GEMINI_API_KEY no configurada: /api/health/gemini y ' +
        '/api/extract devolverán un error de configuración hasta que se ' +
        'defina en .env.',
    )
  }
})

function shutdown(signal: NodeJS.Signals): void {
  console.log(`[server] señal ${signal} recibida, cerrando…`)
  server.close(() => process.exit(0))
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
