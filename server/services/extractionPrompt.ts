import { Type } from '@google/genai'
import type { Schema } from '@google/genai'
import type {
  FieldDefinition,
  FieldKind,
  PolicyType,
} from '../../shared/types.ts'

const KIND_HINTS: Record<FieldKind, string> = {
  text: 'texto libre',
  number: 'número decimal, sin separadores de miles',
  currency: 'importe numérico, sin símbolo de moneda ni separadores',
  date: 'fecha en formato AAAA-MM-DD',
  select: 'uno de los valores permitidos',
  boolean: 'Sí o No',
}

export interface ExtractionPrompt {
  systemInstruction: string
  prompt: string
  responseSchema: Schema
}

const SYSTEM_INSTRUCTION = [
  'Eres un asistente experto en seguros que extrae datos de pólizas.',
  'Reglas estrictas:',
  '- Extrae únicamente valores presentes de forma explícita en el documento.',
  '- Nunca inventes, adivines ni completes datos que no aparezcan.',
  '- Si un campo no está en el documento, omítelo por completo.',
  '- Respeta el formato indicado para cada campo.',
  '- Acompaña cada valor con una "confidence" entre 0 y 1 según tu certeza.',
  '- Si puedes, incluye "page" (número de página) y "snippet" (fragmento breve del texto de origen) para trazar el dato.',
  '- Nunca incluyas información sensible innecesaria en "snippet".',
  '- Responde solo con el JSON solicitado, sin texto adicional.',
].join('\n')

function buildSchema(definitions: FieldDefinition[]): Schema {
  const properties: Record<string, Schema> = {}
  for (const definition of definitions) {
    properties[definition.key] = {
      type: Type.OBJECT,
      description: definition.label,
      properties: {
        value: { type: Type.STRING },
        confidence: { type: Type.NUMBER },
        page: { type: Type.NUMBER },
        snippet: { type: Type.STRING },
      },
      required: ['value'],
    }
  }

  return {
    type: Type.OBJECT,
    properties: {
      fields: {
        type: Type.OBJECT,
        properties,
        propertyOrdering: definitions.map((definition) => definition.key),
      },
    },
    required: ['fields'],
  }
}

export function buildExtractionPrompt(
  policyType: PolicyType,
  definitions: FieldDefinition[],
): ExtractionPrompt {
  const fieldLines = definitions.map((definition) => {
    const hint = KIND_HINTS[definition.kind]
    const options =
      definition.options && definition.options.length > 0
        ? ` Valores permitidos: ${definition.options.join(', ')}.`
        : ''
    const required = definition.required ? ' Campo obligatorio si aparece.' : ''
    return `- "${definition.key}" (${definition.label}): ${hint}.${options}${required}`
  })

  const prompt = [
    'Analiza el documento adjunto y extrae los siguientes campos de la póliza.',
    `Tipo de póliza: ${policyType}.`,
    'Campos a extraer:',
    ...fieldLines,
    '',
    'Devuelve un objeto con la forma {"fields": { "<clave>": {"value": "...", "confidence": 0.0, "page": 1, "snippet": "..."} }}.',
    'Incluye en "fields" solo las claves que hayas encontrado en el documento.',
  ].join('\n')

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: buildSchema(definitions),
  }
}
