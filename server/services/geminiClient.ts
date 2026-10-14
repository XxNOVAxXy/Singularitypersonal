import { GoogleGenAI } from '@google/genai'
import type { Part, Schema } from '@google/genai'
import {
  ConfigurationError,
  env,
  requireGeminiApiKey,
} from '../config/env.ts'

const REQUEST_TIMEOUT_MS = 10_000
const HEALTH_PROMPT = 'Responde únicamente con la palabra OK.'

export type GeminiErrorCode =
  | 'configuration_error'
  | 'authentication_error'
  | 'rate_limited'
  | 'invalid_request'
  | 'service_unavailable'
  | 'timeout'
  | 'upstream_error'

export class GeminiServiceError extends Error {
  readonly code: GeminiErrorCode
  readonly status: number

  constructor(code: GeminiErrorCode, status: number, message: string) {
    super(message)
    this.name = 'GeminiServiceError'
    this.code = code
    this.status = status
  }
}

let client: GoogleGenAI | null = null

/**
 * Inicializa (una sola vez) el cliente oficial de Gemini.
 * La API key se lee del entorno del backend y nunca se expone.
 */
function getClient(): GoogleGenAI {
  if (!client) {
    client = new GoogleGenAI({
      apiKey: requireGeminiApiKey(),
      httpOptions: { timeout: REQUEST_TIMEOUT_MS },
    })
  }
  return client
}

export function getModelName(): string {
  return env.geminiModel
}

interface ProviderErrorShape {
  status?: number
  code?: number | string
  name?: string
  message?: string
}

/**
 * Traduce cualquier fallo a un error propio, sin filtrar mensajes crudos
 * del proveedor ni datos de la solicitud.
 */
function classifyError(error: unknown): GeminiServiceError {
  if (error instanceof ConfigurationError) {
    return new GeminiServiceError(
      'configuration_error',
      500,
      'Configuración de Gemini incompleta.',
    )
  }

  const shape = error as ProviderErrorShape
  const status = typeof shape?.status === 'number' ? shape.status : undefined
  const code = typeof shape?.code === 'number' ? shape.code : undefined
  const name = shape?.name
  const message = (shape?.message ?? '').toLowerCase()

  if (
    status === 401 ||
    status === 403 ||
    /api key|permission|unauthenticated|credential|forbidden/.test(message)
  ) {
    return new GeminiServiceError(
      'authentication_error',
      502,
      'No fue posible autenticar con Gemini.',
    )
  }

  if (status === 429 || /quota|rate limit|resource_exhausted/.test(message)) {
    return new GeminiServiceError(
      'rate_limited',
      429,
      'Límite de uso alcanzado en Gemini.',
    )
  }

  if (
    status === 503 ||
    /unavailable|high demand|overloaded/.test(message)
  ) {
    return new GeminiServiceError(
      'service_unavailable',
      503,
      'El servicio de Gemini no está disponible temporalmente.',
    )
  }

  if (
    status === 400 ||
    code === 400 ||
    status === 404 ||
    /model not found|not found/.test(message)
  ) {
    return new GeminiServiceError(
      'invalid_request',
      400,
      'Solicitud o modelo inválido para Gemini.',
    )
  }

  if (
    status === 504 ||
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /timeout|timed out|deadline/.test(message)
  ) {
    return new GeminiServiceError(
      'timeout',
      504,
      'Tiempo de espera agotado al contactar Gemini.',
    )
  }

  return new GeminiServiceError(
    'upstream_error',
    502,
    'Error al contactar el servicio de Gemini.',
  )
}

export interface GeminiHealthResult {
  ok: true
  model: string
}

/**
 * Prueba real y mínima de conexión con Gemini.
 * No registra ni devuelve el contenido de la respuesta ni la API key.
 */
export async function checkGeminiConnection(): Promise<GeminiHealthResult> {
  try {
    const ai = getClient()
    // Se ignora deliberadamente el contenido; solo importa que la llamada tenga éxito.
    await ai.models.generateContent({
      model: env.geminiModel,
      contents: HEALTH_PROMPT,
      config: { maxOutputTokens: 8, temperature: 0 },
    })

    return { ok: true, model: env.geminiModel }
  } catch (error) {
    throw classifyError(error)
  }
}

/** Documento en base64 enviado a Gemini como contenido en línea. */
export interface GeminiInlineDocument {
  mimeType: string
  dataBase64: string
}

export interface GeminiJsonRequest {
  systemInstruction: string
  prompt: string
  document?: GeminiInlineDocument
  responseSchema?: Schema
  maxOutputTokens?: number
  temperature?: number
  timeoutMs?: number
}

/**
 * Contrato mínimo usado por el endpoint de extracción.
 * Se abstrae para poder inyectar una implementación falsa en las pruebas.
 */
export interface GeminiGateway {
  generateJson(request: GeminiJsonRequest): Promise<string>
}

const DEFAULT_EXTRACTION_MAX_TOKENS = 4096

class GeminiClientGateway implements GeminiGateway {
  async generateJson(request: GeminiJsonRequest): Promise<string> {
    try {
      const ai = getClient()

      const parts: Part[] = []
      if (request.document) {
        parts.push({
          inlineData: {
            mimeType: request.document.mimeType,
            data: request.document.dataBase64,
          },
        })
      }
      parts.push({ text: request.prompt })

      const response = await ai.models.generateContent({
        model: env.geminiModel,
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction: request.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: request.responseSchema,
          maxOutputTokens:
            request.maxOutputTokens ?? DEFAULT_EXTRACTION_MAX_TOKENS,
          temperature: request.temperature ?? 0,
          httpOptions: request.timeoutMs
            ? { timeout: request.timeoutMs }
            : undefined,
        },
      })

      const text = response.text
      if (!text || text.trim().length === 0) {
        throw new GeminiServiceError(
          'upstream_error',
          502,
          'Gemini devolvió una respuesta vacía.',
        )
      }
      return text
    } catch (error) {
      if (error instanceof GeminiServiceError) throw error
      throw classifyError(error)
    }
  }
}

export const geminiGateway: GeminiGateway = new GeminiClientGateway()
