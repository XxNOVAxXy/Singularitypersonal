import type {
  ExtractionField,
  FieldDefinition,
  FieldReviewStatus,
  PolicyDocument,
} from './types.ts'

export const REVIEW_CONFIDENCE_THRESHOLD = 0.7

export function createFieldFromDefinition(
  definition: FieldDefinition,
  overrides: Partial<ExtractionField> = {},
): ExtractionField {
  return {
    key: definition.key,
    label: definition.label,
    kind: definition.kind,
    scope: definition.scope,
    value: '',
    source: 'manual',
    status: definition.required ? 'missing' : 'ok',
    required: definition.required,
    options: definition.options,
    ...overrides,
  }
}

export function resolveStatus(field: ExtractionField): FieldReviewStatus {
  return applyFieldValidation(field).status
}

export function applyFieldValidation(field: ExtractionField): ExtractionField {
  const trimmed = field.value.trim()
  let note = field.note
  let reason = field.reason

  if (trimmed === '') {
    const status: FieldReviewStatus = field.required ? 'missing' : 'ok'
    if (field.required) {
      note = note ?? 'Campo obligatorio sin valor'
      reason = reason ?? 'missing_required'
    }
    return { ...field, status, note, reason }
  }

  // El estado se recalcula desde el valor; no se arrastra el estado previo.
  let status: FieldReviewStatus = 'ok'

  if (typeof field.confidence === 'number') {
    if (field.confidence < REVIEW_CONFIDENCE_THRESHOLD) {
      status = 'review'
      note = note ?? 'Confianza baja del modelo'
      reason = reason ?? 'low_confidence'
    }
  } else if (field.source === 'gemini') {
    // Sin una medida de confianza del modelo no se da por validado.
    status = 'review'
    note = note ?? 'Sin medida de confianza; requiere revisión'
    reason = reason ?? 'low_confidence'
  }

  switch (field.kind) {
    case 'date': {
      const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
      if (!DATE_REGEX.test(trimmed)) {
        status = 'review'
        note = note ?? 'Formato de fecha inválido (esperado YYYY-MM-DD)'
        reason = reason ?? 'invalid_format'
      } else {
        const d = new Date(trimmed + 'T00:00:00')
        const [y, m, day] = trimmed.split('-').map(Number)
        if (
          Number.isNaN(d.getTime()) ||
          d.getUTCFullYear() !== y ||
          d.getUTCMonth() + 1 !== m ||
          d.getUTCDate() !== day
        ) {
          status = 'review'
          note = note ?? 'Fecha no válida'
          reason = reason ?? 'invalid_format'
        }
      }
      break
    }
    case 'number': {
      const normalized = trimmed.replace(/,/g, '.')
      if (!(/^[-+]?\d*\.?\d+$/.test(normalized) && Number.isFinite(Number(normalized)))) {
        status = 'review'
        note = note ?? 'Formato numérico inválido'
        reason = reason ?? 'invalid_format'
      }
      break
    }
    case 'currency': {
      const normalized = trimmed.replace(/[\s$,]/g, '').replace(/,/g, '.')
      if (!(/^[-+]?\d*\.?\d+$/.test(normalized) && Number.isFinite(Number(normalized)))) {
        status = 'review'
        note = note ?? 'Formato de moneda inválido'
        reason = reason ?? 'invalid_format'
      }
      break
    }
    case 'boolean': {
      if (trimmed !== 'Sí' && trimmed !== 'No') {
        status = 'review'
        note = note ?? 'Valor booleano ambiguo'
        reason = reason ?? 'ambiguous'
      }
      break
    }
    case 'select': {
      if (field.options && field.options.length > 0) {
        if (!field.options.includes(trimmed)) {
          status = 'review'
          note = note ?? 'Valor no coincide con las opciones disponibles'
          reason = reason ?? 'ambiguous'
        }
      }
      break
    }
    default:
      break
  }
  return { ...field, status, note, reason }
}

export function withResolvedStatus(field: ExtractionField): ExtractionField {
  return applyFieldValidation(field)
}

/**
 * Aplica una edición del usuario: marca el origen como `user`, descarta la
 * confianza y la trazabilidad previas (ya no describen el nuevo valor) y
 * recalcula el estado con las mismas reglas de validación.
 */
export function applyUserEdit(
  field: ExtractionField,
  value: string,
): ExtractionField {
  return applyFieldValidation({
    ...field,
    value,
    source: 'user',
    confidence: undefined,
    note: undefined,
    reason: undefined,
    page: undefined,
    sourceRef: undefined,
  })
}

export interface ExtractionSummary {
  total: number
  filled: number
  missing: number
  review: number
  completion: number
}

export function summarizeExtraction(
  fields: ExtractionField[],
): ExtractionSummary {
  const filled = fields.filter((field) => field.value.trim().length > 0).length
  const missing = fields.filter((field) => field.status === 'missing').length
  const review = fields.filter((field) => field.status === 'review').length
  return {
    total: fields.length,
    filled,
    missing,
    review,
    completion: fields.length === 0 ? 0 : filled / fields.length,
  }
}

export interface GroupedFields {
  general: ExtractionField[]
  specific: ExtractionField[]
  additional: ExtractionField[]
}

export function groupFields(fields: ExtractionField[]): GroupedFields {
  return {
    general: fields.filter((field) => field.scope === 'general'),
    specific: fields.filter((field) => field.scope === 'specific'),
    additional: fields.filter((field) => field.scope === 'additional'),
  }
}

export function buildExtractionJson(
  document: PolicyDocument | null,
  method: string,
  fields: ExtractionField[],
): Record<string, unknown> {
  const grouped = groupFields(fields)
  const toRecordGroup = (group: ExtractionField[]) =>
    group.reduce<Record<string, unknown>>((accumulator, field) => {
      accumulator[field.key] = field.value
      return accumulator
    }, {})

  return {
    document: document
      ? {
          id: document.id,
          name: document.name,
          policyNumber: document.policyNumber,
          policyType: document.policyType,
          insurer: document.insurer,
          client: document.client,
        }
      : null,
    extraction: {
      method,
      generatedAt: new Date().toISOString(),
      fields: {
        general: toRecordGroup(grouped.general),
        specific: toRecordGroup(grouped.specific),
        additional: toRecordGroup(grouped.additional),
      },
    },
  }
}

export const statusLabels: Record<FieldReviewStatus, string> = {
  ok: 'Validado',
  review: 'Pendiente de revisión',
  missing: 'Dato no encontrado',
}

