import { GoogleGenAI } from '@google/genai'
import type { Part, Schema } from '@google/genai'
import {
  ConfigurationError,
  env,
  requireGeminiApiKey,
} from '../config/env.ts'

const REQUEST_TIMEOUT_MS = 30_000
const TRANSIENT_RETRY_DELAY_MS = 2_000
const MAX_TRANSIENT_ATTEMPTS = 3
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
  readonly retryAfterMs?: number
  readonly quotaExhausted: boolean
  readonly model?: string

  constructor(
    code: GeminiErrorCode,
    status: number,
    message: string,
    options: {
      retryAfterMs?: number
      quotaExhausted?: boolean
      model?: string
    } = {},
  ) {
    super(message)
    this.name = 'GeminiServiceError'
    this.code = code
    this.status = status
    this.retryAfterMs = options.retryAfterMs
    this.quotaExhausted = options.quotaExhausted ?? false
    this.model = options.model
  }
}

let client: GoogleGenAI | null = null

export function resetGeminiClient(): void {
  client = null
}

/**
 * Inicializa (una sola vez) el cliente oficial de Gemini.
 * La API key se obtiene en el backend y nunca se expone al navegador.
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
  headers?: unknown
  response?: { headers?: unknown }
}

function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined
  const candidate = headers as {
    get?: (key: string) => string | null
    [key: string]: unknown
  }
  if (typeof candidate.get === 'function') {
    return candidate.get(name) ?? undefined
  }
  const value = candidate[name] ?? candidate[name.toLowerCase()]
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : undefined
}

function retryAfterMs(error: unknown): number | undefined {
  const shape = error as ProviderErrorShape
  const raw =
    readHeader(shape.headers, 'retry-after') ??
    readHeader(shape.response?.headers, 'retry-after')
  if (!raw) return undefined

  const seconds = Number(raw)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const timestamp = Date.parse(raw)
  return Number.isNaN(timestamp) ? undefined : Math.max(0, timestamp - Date.now())
}

function isDailyQuotaMessage(message: string): boolean {
  return /daily|per day|per-day|quota.*(?:exhaust|exceed|day)|limit.*day/.test(message)
}

/**
 * Traduce cualquier fallo a un error propio, sin filtrar mensajes crudos
 * del proveedor ni datos de la solicitud.
 */
function classifyError(error: unknown, model?: string): GeminiServiceError {
  if (error instanceof ConfigurationError) {
    return new GeminiServiceError(
      'configuration_error',
      500,
      'Configuración de Gemini incompleta.',
      { model },
    )
  }

  const shape = error as ProviderErrorShape
  const numericCode = Number(shape?.code)
  const providerCode = Number.isFinite(numericCode) ? numericCode : undefined
  const status = typeof shape?.status === 'number'
    ? shape.status
    : providerCode !== undefined
      ? providerCode
      : undefined
  const code = providerCode
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
      { model },
    )
  }

  if (status === 429 || /quota|rate limit|resource_exhausted/.test(message)) {
    return new GeminiServiceError(
      'rate_limited',
      429,
      'Límite de uso alcanzado en Gemini.',
      {
        retryAfterMs: retryAfterMs(error),
        quotaExhausted: isDailyQuotaMessage(message),
        model,
      },
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
      { retryAfterMs: retryAfterMs(error), model },
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
      { model },
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
      { model },
    )
  }

  return new GeminiServiceError(
    'upstream_error',
    502,
    'Error al contactar el servicio de Gemini.',
    { model },
  )
}

function isTransientProviderError(error: unknown): boolean {
  const shape = error as ProviderErrorShape
  const message = (shape?.message ?? '').toLowerCase()
  const status = Number(shape?.status ?? shape?.code)
  return (
    status === 503 ||
    status === 429 ||
    /unavailable|high demand|overloaded/.test(message)
  )
}

function isModelAvailabilityError(error: GeminiServiceError): boolean {
  return error.code === 'invalid_request' && error.status === 404
}

function retryDelay(error: GeminiServiceError, attempt: number): number {
  const exponential = TRANSIENT_RETRY_DELAY_MS * 2 ** attempt
  return Math.max(error.retryAfterMs ?? 0, exponential)
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
  let lastError: GeminiServiceError | undefined
  for (const model of [env.geminiModel, ...env.geminiFallbackModels]) {
    try {
      const ai = getClient()
      // Se ignora deliberadamente el contenido; solo importa que la llamada tenga éxito.
      await ai.models.generateContent({
        model,
        contents: HEALTH_PROMPT,
        config: { maxOutputTokens: 8, temperature: 0 },
      })

      return { ok: true, model }
    } catch (error) {
      lastError = classifyError(error, model)
      if (lastError.quotaExhausted) throw lastError
    }
  }
  throw lastError ?? new GeminiServiceError(
    'service_unavailable',
    503,
    'El servicio de Gemini no está disponible temporalmente.',
  )
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
  private async generateForModel(
    request: GeminiJsonRequest,
    model: string,
  ): Promise<string> {
    for (let attempt = 0; attempt < MAX_TRANSIENT_ATTEMPTS; attempt += 1) {
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
          model,
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
            { model },
          )
        }
        return text
      } catch (error) {
        if (error instanceof GeminiServiceError) throw error
        const classified = classifyError(error, model)
        if (
          !isTransientProviderError(error) ||
          classified.quotaExhausted ||
          attempt === MAX_TRANSIENT_ATTEMPTS - 1
        ) {
          throw classified
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay(classified, attempt)))
      }
    }

    throw new GeminiServiceError('service_unavailable', 503, 'El servicio de Gemini no está disponible temporalmente.', { model })
  }

  async generateJson(request: GeminiJsonRequest): Promise<string> {
    const models = [env.geminiModel, ...env.geminiFallbackModels]
    let lastError: GeminiServiceError | undefined

    for (const model of models) {
      try {
        return await this.generateForModel(request, model)
      } catch (error) {
        if (!(error instanceof GeminiServiceError)) throw error
        lastError = error
        const canUseNextModel =
          !error.quotaExhausted &&
          (isModelAvailabilityError(error) ||
            error.code === 'service_unavailable' ||
            error.code === 'rate_limited')
        if (!canUseNextModel) throw error
      }
    }

    throw lastError ?? new GeminiServiceError(
      'service_unavailable',
      503,
      'El servicio de Gemini no está disponible temporalmente.',
    )
  }
}

export const geminiGateway: GeminiGateway = new GeminiClientGateway()
