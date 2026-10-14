import express from 'express'
import type { Express, NextFunction, Request, Response } from 'express'
import { geminiGateway } from './services/geminiClient.ts'
import type { GeminiGateway } from './services/geminiClient.ts'
import { healthRouter } from './routes/health.ts'
import { createExtractionRouter } from './routes/extraction.ts'

export interface AppDependencies {
  geminiGateway: GeminiGateway
}

interface BodyParserError {
  type?: string
  status?: number
  statusCode?: number
}

/**
 * Construye la aplicación Express. Las dependencias son inyectables para
 * poder sustituir Gemini por una implementación falsa en las pruebas.
 */
export function createApp(
  dependencies: AppDependencies = { geminiGateway },
): Express {
  const app = express()

  app.disable('x-powered-by')
  app.use(express.json({ limit: '10mb' }))

  app.use('/api', healthRouter)
  app.use('/api', createExtractionRouter(dependencies.geminiGateway))

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: 'not_found' })
  })

  app.use(
    (
      error: unknown,
      _req: Request,
      res: Response,
      _next: NextFunction,
    ): void => {
      if (res.headersSent) return

      const shape = error as BodyParserError
      const status = shape?.status ?? shape?.statusCode

      if (shape?.type === 'entity.too.large' || status === 413) {
        res.status(413).json({ ok: false, error: 'payload_too_large' })
        return
      }
      if (shape?.type === 'entity.parse.failed' || status === 400) {
        res.status(400).json({ ok: false, error: 'invalid_request' })
        return
      }

      // No se registra ni devuelve el mensaje del error para no filtrar datos.
      res.status(500).json({ ok: false, error: 'internal_error' })
    },
  )

  return app
}
