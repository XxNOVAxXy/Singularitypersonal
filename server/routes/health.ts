import { Router } from 'express'
import { env } from '../config/env.ts'
import { geminiHealthGuard } from '../middleware/healthGuard.ts'
import {
  checkGeminiConnection,
  GeminiServiceError,
} from '../services/geminiClient.ts'

export const healthRouter = Router()

healthRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'singularity-backend', env: env.nodeEnv })
})

healthRouter.get('/health/gemini', geminiHealthGuard, async (_req, res) => {
  try {
    const result = await checkGeminiConnection()
    res.json(result)
  } catch (error) {
    if (error instanceof GeminiServiceError) {
      console.error(`[gemini] verificación fallida: ${error.code}`)
      res.status(error.status).json({ ok: false, error: error.code })
      return
    }
    console.error('[gemini] verificación fallida: internal_error')
    res.status(500).json({ ok: false, error: 'internal_error' })
  }
})
