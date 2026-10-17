import { resolveApiBaseUrl } from './apiClient.ts'

export class SettingsServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SettingsServiceError'
  }
}

interface GeminiSettingsResponse {
  configured: boolean
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${resolveApiBaseUrl()}${path}`, init)
  } catch {
    throw new SettingsServiceError('No se pudo conectar con el servidor de configuración.')
  }

  if (!response.ok) {
    throw new SettingsServiceError('No se pudo guardar la configuración de Gemini.')
  }

  try {
    return await response.json() as T
  } catch {
    throw new SettingsServiceError('El servidor devolvió una respuesta inválida.')
  }
}

export function getGeminiSettings(): Promise<GeminiSettingsResponse> {
  return request<GeminiSettingsResponse>('/api/settings/gemini')
}

export function saveGeminiApiKey(apiKey: string): Promise<GeminiSettingsResponse> {
  return request<GeminiSettingsResponse>('/api/settings/gemini', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })
}
