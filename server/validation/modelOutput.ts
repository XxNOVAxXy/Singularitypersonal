import type { FieldKind } from '../../shared/types.ts'

export interface FoundFieldValue {
  value: string
  confidence?: number
  page?: number
  sourceRef?: string
}

export interface ParsedModelOutput {
  values: Map<string, FoundFieldValue>
  unknownFields: string[]
}

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelOutputError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Algunos modelos envuelven el JSON en bloques de código pese a pedir JSON. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  return fenced ? fenced[1].trim() : trimmed
}

function normalizeValue(raw: unknown, kind: FieldKind): string | null {
  if (typeof raw === 'boolean') {
    if (kind === 'boolean') return raw ? 'Sí' : 'No'
    return raw ? 'true' : 'false'
  }
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? String(raw) : null
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (kind === 'boolean') {
      const lower = trimmed.toLowerCase()
      if (['true', 'sí', 'si', 'yes'].includes(lower)) return 'Sí'
      if (['false', 'no'].includes(lower)) return 'No'
    }
    return trimmed
  }
  return null
}

function extractValue(entry: unknown, kind: FieldKind): string | null {
  if (isRecord(entry)) return normalizeValue(entry.value, kind)
  return normalizeValue(entry, kind)
}

function extractConfidence(entry: unknown): number | undefined {
  if (!isRecord(entry)) return undefined
  const confidence = entry.confidence
  if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
    return undefined
  }
  return Math.min(1, Math.max(0, confidence))
}

const MAX_SOURCE_REF_LENGTH = 160

function extractPage(entry: unknown): number | undefined {
  if (!isRecord(entry)) return undefined
  const page = entry.page
  if (typeof page === 'number' && Number.isInteger(page) && page > 0) return page
  if (typeof page === 'string' && /^\d+$/.test(page.trim())) {
    return Number(page.trim())
  }
  return undefined
}

function extractSourceRef(entry: unknown): string | undefined {
  if (!isRecord(entry)) return undefined
  const snippet = entry.snippet
  if (typeof snippet !== 'string') return undefined
  const trimmed = snippet.trim()
  if (trimmed === '') return undefined
  return trimmed.length > MAX_SOURCE_REF_LENGTH
    ? trimmed.slice(0, MAX_SOURCE_REF_LENGTH)
    : trimmed
}

/**
 * Valida y normaliza la salida del modelo. Solo conserva claves conocidas
 * (`allowedFields`) y valores no vacíos; el resto se reporta en `unknownFields`.
 * Nunca inventa datos: una clave ausente simplemente no aparece.
 */
export function parseModelOutput(
  raw: string,
  allowedFields: Map<string, FieldKind>,
): ParsedModelOutput {
  const jsonText = stripCodeFences(raw)

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new ModelOutputError('La respuesta del modelo no es JSON válido.')
  }

  if (!isRecord(parsed)) {
    throw new ModelOutputError('La respuesta del modelo no es un objeto.')
  }

  const fields = parsed.fields
  if (!isRecord(fields)) {
    throw new ModelOutputError(
      'La respuesta del modelo no contiene un objeto "fields".',
    )
  }

  const values = new Map<string, FoundFieldValue>()
  const unknownFields: string[] = []

  for (const [key, entry] of Object.entries(fields)) {
    const kind = allowedFields.get(key)
    if (kind === undefined) {
      unknownFields.push(key)
      continue
    }

    const value = extractValue(entry, kind)
    if (value === null || value.length === 0) continue

    const confidence = extractConfidence(entry)
    const page = extractPage(entry)
    const sourceRef = extractSourceRef(entry)
    const found: FoundFieldValue = { value }
    if (confidence !== undefined) found.confidence = confidence
    if (page !== undefined) found.page = page
    if (sourceRef !== undefined) found.sourceRef = sourceRef
    values.set(key, found)
  }

  return { values, unknownFields }
}
