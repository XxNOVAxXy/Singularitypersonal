import type { ExtractionField, PolicyType } from '../../shared/types.ts'
import {
  createFieldFromDefinition,
  summarizeExtraction,
  withResolvedStatus,
} from '../../shared/extraction.ts'
import {
  additionalFieldDefinitions,
  fieldsForPolicyType,
  generalFieldDefinitions,
} from '../../shared/fieldDefinitions.ts'
import type {
  ExtractionMeta,
  ExtractionRequest,
  ExtractionSuccessResponse,
} from '../../shared/api.ts'
import { getModelName } from './geminiClient.ts'
import type { GeminiGateway } from './geminiClient.ts'
import { buildExtractionPrompt } from './extractionPrompt.ts'
import { parseModelOutput } from '../validation/modelOutput.ts'

const EXTRACTION_TIMEOUT_MS = 45_000
const EXTRACTION_MAX_TOKENS = 4096

function targetDefinitions(policyType: PolicyType) {
  return [
    ...generalFieldDefinitions,
    ...fieldsForPolicyType(policyType),
    ...additionalFieldDefinitions,
  ]
}

/**
 * Orquesta la extracción: construye el prompt/schema, llama a Gemini y
 * normaliza la salida con las mismas reglas que usa el frontend.
 */
export async function runExtraction(
  request: ExtractionRequest,
  gateway: GeminiGateway,
): Promise<ExtractionSuccessResponse> {
  const definitions = targetDefinitions(request.policyType)
  const allowedFields = new Map(
    definitions.map((definition) => [definition.key, definition.kind] as const),
  )

  const { systemInstruction, prompt, responseSchema } = buildExtractionPrompt(
    request.policyType,
    definitions,
  )

  const raw = await gateway.generateJson({
    systemInstruction,
    prompt,
    responseSchema,
    document: {
      mimeType: request.document.mimeType,
      dataBase64: request.document.dataBase64,
    },
    timeoutMs: EXTRACTION_TIMEOUT_MS,
    maxOutputTokens: EXTRACTION_MAX_TOKENS,
  })

  const { values, unknownFields } = parseModelOutput(raw, allowedFields)

  const fields: ExtractionField[] = definitions.map((definition) => {
    const found = values.get(definition.key)
    const base = createFieldFromDefinition(definition)
    const withSource: ExtractionField =
      found && found.value.length > 0
        ? {
            ...base,
            value: found.value,
            source: 'gemini',
            confidence: found.confidence,
            page: found.page,
            sourceRef: found.sourceRef,
          }
        : { ...base, source: 'gemini' }
    return withResolvedStatus(withSource)
  })

  const summary = summarizeExtraction(fields)
  const providedFields = fields.filter(
    (field) => field.value.trim().length > 0,
  ).length
  const missingRequired = fields.filter(
    (field) => field.required && field.value.trim().length === 0,
  ).length

  const meta: ExtractionMeta = {
    model: getModelName(),
    policyType: request.policyType,
    totalFields: fields.length,
    providedFields,
    missingRequired,
    unknownFields,
  }

  return { ok: true, method: 'gemini', fields, summary, meta }
}
