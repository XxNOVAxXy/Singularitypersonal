import type { PolicyType } from '../../shared/types.ts'
import type { ExtractionSuccessResponse } from '../../shared/api.ts'
import { ApiError, createApiClient } from './apiClient.ts'
import type { ApiClient } from './apiClient.ts'
import { fileToDocumentInput } from './documentInput.ts'
import type { DocumentInput } from './documentInput.ts'

export type ExtractionErrorCode =
  | 'invalid_request'
  | 'unsupported_media_type'
  | 'payload_too_large'
  | 'configuration_error'
  | 'authentication_error'
  | 'rate_limited'
  | 'service_unavailable'
  | 'timeout'
  | 'upstream_error'
  | 'model_output_invalid'
  | 'internal_error'
  | 'network_error'
  | 'unexpected_response'

export const EXTRACTION_ERROR_MESSAGES: Record<ExtractionErrorCode, string> = {
  invalid_request:
    'La solicitud no es válida. Revisa el documento e inténtalo de nuevo.',
  unsupported_media_type:
    'El tipo de archivo no es compatible. Usa PDF, PNG, JPG o WEBP.',
  payload_too_large: 'El documento es demasiado grande (máximo 6 MB).',
  configuration_error:
    'El servidor no tiene configurada la API de Gemini.',
  authentication_error:
    'No se pudo autenticar con Gemini. Revisa la configuración del servidor.',
  rate_limited:
    'Se alcanzó el límite de uso de Gemini. Inténtalo más tarde.',
  service_unavailable:
    'El servicio de Gemini no está disponible en este momento. Inténtalo más tarde.',
  timeout: 'La extracción tardó demasiado. Inténtalo de nuevo.',
  upstream_error: 'Ocurrió un error al contactar el servicio de Gemini.',
  model_output_invalid:
    'Gemini devolvió una respuesta que no se pudo interpretar.',
  internal_error: 'Ocurrió un error inesperado en el servidor.',
  network_error:
    'No se pudo conectar con el servidor de extracción. Verifica que esté en ejecución.',
  unexpected_response:
    'El servidor devolvió una respuesta inesperada.',
}

export class ExtractionServiceError extends Error {
  readonly code: ExtractionErrorCode
  readonly details?: string[]

  constructor(
    code: ExtractionErrorCode,
    message: string,
    details?: string[],
  ) {
    super(message)
    this.name = 'ExtractionServiceError'
    this.code = code
    this.details = details
  }
}

const KNOWN_CODES = new Set<ExtractionErrorCode>(
  Object.keys(EXTRACTION_ERROR_MESSAGES) as ExtractionErrorCode[],
)

const defaultClient = createApiClient()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function codeFromStatus(status?: number): ExtractionErrorCode {
  switch (status) {
    case 400:
      return 'invalid_request'
    case 413:
      return 'payload_too_large'
    case 415:
      return 'unsupported_media_type'
    case 429:
      return 'rate_limited'
    case 502:
      return 'upstream_error'
    case 503:
      return 'service_unavailable'
    case 504:
      return 'timeout'
    case 500:
      return 'internal_error'
    default:
      return 'internal_error'
  }
}

function toServiceError(error: unknown): ExtractionServiceError {
  if (error instanceof ExtractionServiceError) return error

  if (error instanceof ApiError) {
    if (error.kind === 'timeout') {
      return new ExtractionServiceError('timeout', EXTRACTION_ERROR_MESSAGES.timeout)
    }
    if (error.kind === 'network') {
      return new ExtractionServiceError(
        'network_error',
        EXTRACTION_ERROR_MESSAGES.network_error,
      )
    }
    if (error.kind === 'parse') {
      return new ExtractionServiceError(
        'unexpected_response',
        EXTRACTION_ERROR_MESSAGES.unexpected_response,
      )
    }
    const code =
      error.code && KNOWN_CODES.has(error.code as ExtractionErrorCode)
        ? (error.code as ExtractionErrorCode)
        : codeFromStatus(error.status)
    return new ExtractionServiceError(
      code,
      EXTRACTION_ERROR_MESSAGES[code],
      error.details,
    )
  }

  return new ExtractionServiceError(
    'internal_error',
    EXTRACTION_ERROR_MESSAGES.internal_error,
  )
}

function isValidSuccessPayload(
  payload: unknown,
): payload is ExtractionSuccessResponse {
  if (!isRecord(payload) || payload.ok !== true) return false
  if (!Array.isArray(payload.fields)) return false
  return payload.fields.every(
    (field) =>
      isRecord(field) &&
      typeof field.key === 'string' &&
      typeof field.value === 'string' &&
      typeof field.status === 'string',
  )
}

export interface ExtractOptions {
  client?: ApiClient
  signal?: AbortSignal
}

export async function extractPolicyFields(
  request: { policyType: PolicyType; document: DocumentInput },
  options: ExtractOptions = {},
): Promise<ExtractionSuccessResponse> {
  const client = options.client ?? defaultClient

  let payload: unknown
  try {
    payload = await client.postJson('/api/extract', request, {
      signal: options.signal,
    })
  } catch (error) {
    throw toServiceError(error)
  }

  if (!isValidSuccessPayload(payload)) {
    throw new ExtractionServiceError(
      'unexpected_response',
      EXTRACTION_ERROR_MESSAGES.unexpected_response,
    )
  }

  return payload
}

export async function extractFromFile(
  input: { policyType: PolicyType; file: File },
  options: ExtractOptions = {},
): Promise<ExtractionSuccessResponse> {
  let document: DocumentInput
  try {
    document = await fileToDocumentInput(input.file)
  } catch {
    throw new ExtractionServiceError(
      'unsupported_media_type',
      EXTRACTION_ERROR_MESSAGES.unsupported_media_type,
    )
  }
  return extractPolicyFields(
    { policyType: input.policyType, document },
    options,
  )
}
