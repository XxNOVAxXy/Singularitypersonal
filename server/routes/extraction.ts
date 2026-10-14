import { Router } from 'express'
import type { Request, Response } from 'express'
import { GeminiServiceError } from '../services/geminiClient.ts'
import type { GeminiGateway } from '../services/geminiClient.ts'
import { runExtraction } from '../services/extractionService.ts'
import { ModelOutputError } from '../validation/modelOutput.ts'
import { validateExtractionRequest } from '../validation/extractionRequest.ts'

export function createExtractionRouter(gateway: GeminiGateway): Router {
  const router = Router()

  router.post('/extract', async (req: Request, res: Response) => {
    const parsed = validateExtractionRequest(req.body)
    if (!parsed.ok) {
      res.status(parsed.status).json({
        ok: false,
        error: parsed.error,
        ...(parsed.details ? { details: parsed.details } : {}),
      })
      return
    }

    try {
      const result = await runExtraction(parsed.value, gateway)
      res.json(result)
    } catch (error) {
      if (error instanceof GeminiServiceError) {
        console.error(`[extract] fallo de Gemini: ${error.code}`)
        res.status(error.status).json({ ok: false, error: error.code })
        return
      }
      if (error instanceof ModelOutputError) {
        console.error('[extract] la salida del modelo no es válida')
        res.status(502).json({ ok: false, error: 'model_output_invalid' })
        return
      }
      console.error('[extract] error interno')
      res.status(500).json({ ok: false, error: 'internal_error' })
    }
  })

  return router
}
