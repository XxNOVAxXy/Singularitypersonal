import type { ExtractionField, FieldKind, PolicyType } from '../../shared/types.ts'
import type { ExtractionSuccessResponse } from '../../shared/api.ts'
import { ApiError, createApiClient, resolveApiBaseUrl } from './apiClient.ts'
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
  | 'quota_exhausted'
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
  quota_exhausted:
    'Se agotó la cuota diaria de Gemini. La extracción local queda disponible; no se harán más reintentos automáticos.',
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
      timeoutMs: 130_000,
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

function fieldKind(key: string): FieldKind {
  if (key.includes('date')) return 'date'
  if (['premium', 'deductible', 'sumInsured', 'bondedAmount', 'paidAmount'].includes(key)) return 'currency'
  if (['currency', 'paymentMethod', 'coverageLevel', 'bondType'].includes(key)) return 'select'
  return 'text'
}

function fieldOptions(key: string, value: string): string[] | undefined {
  const options: Record<string, string[]> = {
    currency: ['MXN', 'USD', 'EUR'],
    paymentMethod: ['Contado', 'Mensual', 'Trimestral', 'Semestral', 'Anual'],
    coverageLevel: ['Básico', 'Amplio', 'Premium'],
    bondType: ['Cumplimiento', 'Fidelidad', 'Crédito', 'Judicial'],
  }
  const known = options[key]
  if (!known || !value || known.includes(value)) return known
  return [...known, value]
}

/** Convierte la respuesta del extractor local al modelo que consume el formulario. */
export function mapRulesFields(payload: unknown): ExtractionField[] {
  if (!isRecord(payload) || !Array.isArray(payload.fields)) return []

  return payload.fields.flatMap((item): ExtractionField[] => {
    if (!isRecord(item) || typeof item.key !== 'string' || typeof item.label !== 'string') {
      return []
    }

    const value = item.value == null ? '' : String(item.value)
    const scope = item.category === 'specific' ? 'specific' : 'general'
    const source = isRecord(item.source) ? item.source : null
    const page = source && typeof source.page === 'number' ? source.page : undefined

    return [{
      key: item.key,
      label: item.label,
      kind: fieldKind(item.key),
      scope,
      value,
      source: 'manual',
      status: value ? 'ok' : 'missing',
      required: typeof item.required === 'boolean' ? item.required : scope === 'general',
      options: fieldOptions(item.key, value),
      confidence: typeof item.confidence === 'number' ? item.confidence / 100 : undefined,
      page,
    }]
  })
}

export async function extractWithRules(
  file: File,
  options: ExtractOptions = {},
  policyType?: PolicyType,
): Promise<ExtractionField[]> {
  const formData = new FormData()
  formData.append('file', file)
  const query = policyType ? `?policy_type=${encodeURIComponent(policyType)}` : ''

  let response: Response
  try {
    response = await fetch(`${resolveApiBaseUrl()}/api/extractions/rules${query}`, {
      method: 'POST',
      body: formData,
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ExtractionServiceError('timeout', EXTRACTION_ERROR_MESSAGES.timeout)
    }
    throw new ExtractionServiceError('network_error', EXTRACTION_ERROR_MESSAGES.network_error)
  }

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const detail = isRecord(payload) && typeof payload.detail === 'string' ? payload.detail : null
    throw new ExtractionServiceError(
      codeFromStatus(response.status),
      detail ?? EXTRACTION_ERROR_MESSAGES[codeFromStatus(response.status)],
    )
  }

  const fields = mapRulesFields(payload)
  if (!isRecord(payload) || !Array.isArray(payload.fields)) {
    throw new ExtractionServiceError(
      'unexpected_response',
      EXTRACTION_ERROR_MESSAGES.unexpected_response,
    )
  }
  return fields
}

export async function downloadPdf(
  url: string,
  fileName: string,
  options: ExtractOptions = {},
): Promise<File> {
  let response: Response
  try {
    response = await fetch(url, { signal: options.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ExtractionServiceError('timeout', EXTRACTION_ERROR_MESSAGES.timeout)
    }
    throw new ExtractionServiceError('network_error', EXTRACTION_ERROR_MESSAGES.network_error)
  }

  if (!response.ok) {
    const code = codeFromStatus(response.status)
    throw new ExtractionServiceError(code, EXTRACTION_ERROR_MESSAGES[code])
  }

  return new File([await response.blob()], fileName, { type: 'application/pdf' })
}
