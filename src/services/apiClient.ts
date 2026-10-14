export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'parse'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number
  readonly code?: string
  readonly details?: string[]

  constructor(
    kind: ApiErrorKind,
    message: string,
    extra: { status?: number; code?: string; details?: string[] } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = extra.status
    this.code = extra.code
    this.details = extra.details
  }
}

export interface RequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

export interface ApiClient {
  postJson<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>
}

export interface ApiClientOptions {
  baseUrl?: string
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

const DEFAULT_TIMEOUT_MS = 60_000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  )
}

/**
 * Resuelve la URL base de la API. Vacío => rutas relativas (`/api`), que en
 * desarrollo pasan por el proxy de Vite. La API key nunca vive en el frontend.
 */
export function resolveApiBaseUrl(): string {
  const meta = import.meta as unknown as {
    env?: Record<string, string | undefined>
  }
  const raw = meta.env?.VITE_API_BASE_URL?.trim()
  if (!raw) return ''
  return raw.replace(/\/+$/, '')
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = (options.baseUrl ?? resolveApiBaseUrl()).replace(/\/+$/, '')
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const doFetch = options.fetchImpl ?? globalThis.fetch

  return {
    async postJson<T>(
      path: string,
      body: unknown,
      requestOptions: RequestOptions = {},
    ): Promise<T> {
      const controller = new AbortController()
      const timeoutMs = requestOptions.timeoutMs ?? defaultTimeout
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      const external = requestOptions.signal
      if (external) {
        if (external.aborted) controller.abort()
        else
          external.addEventListener('abort', () => controller.abort(), {
            once: true,
          })
      }

      try {
        const response = await doFetch(`${baseUrl}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        const text = await response.text()
        let payload: unknown = null
        if (text.length > 0) {
          try {
            payload = JSON.parse(text)
          } catch {
            throw new ApiError(
              'parse',
              'El servidor devolvió una respuesta no interpretable.',
            )
          }
        }

        if (!response.ok) {
          const code =
            isRecord(payload) && typeof payload.error === 'string'
              ? payload.error
              : undefined
          const details =
            isRecord(payload) &&
            Array.isArray(payload.details) &&
            payload.details.every((item) => typeof item === 'string')
              ? (payload.details as string[])
              : undefined
          throw new ApiError(
            'http',
            `La solicitud fue rechazada (${response.status}).`,
            { status: response.status, code, details },
          )
        }

        return payload as T
      } catch (error) {
        if (error instanceof ApiError) throw error
        if (isAbortError(error)) {
          throw new ApiError(
            'timeout',
            'La solicitud excedió el tiempo de espera.',
          )
        }
        throw new ApiError('network', 'No se pudo conectar con el servidor.')
      } finally {
        clearTimeout(timer)
      }
    },
  }
}
