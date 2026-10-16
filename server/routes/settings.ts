import { Router } from 'express'
import {
  isGeminiApiKeyConfigured,
  setGeminiApiKey,
} from '../config/env.ts'
import { resetGeminiClient } from '../services/geminiClient.ts'

export const settingsRouter = Router()

settingsRouter.get('/settings/gemini', (_req, res) => {
  res.json({ configured: isGeminiApiKeyConfigured() })
})

settingsRouter.post('/settings/gemini', (req, res) => {
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : ''
  if (!apiKey) {
    res.status(400).json({ ok: false, error: 'api_key_required' })
    return
  }

  setGeminiApiKey(apiKey)
  resetGeminiClient()
  res.json({ ok: true, configured: true })
})
