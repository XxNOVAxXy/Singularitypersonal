import type { ExtractionField, PolicyDocument } from '@/types'
import {
  additionalFieldDefinitions,
  fieldsForPolicyType,
  generalFieldDefinitions,
} from '@/mocks/fieldDefinitions'
import {
  createFieldFromDefinition,
  withResolvedStatus,
} from '@/features/extraction/utils/extractionUtils'

function addYears(isoDate: string, years: number): string {
  const date = new Date(isoDate)
  date.setFullYear(date.getFullYear() + years)
  return date.toISOString().slice(0, 10)
}

function confidenceFor(key: string): number {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) % 1000
  }
  return 0.55 + (hash % 45) / 100
}

function money(value: number): string {
  return value.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

const sumInsuredByType: Record<string, number> = {
  auto: 245000,
  gmm: 1200000,
  vida: 1500000,
  fianza: 800000,
  danos: 3200000,
  recibo: 12500,
}

const specificValues: Record<string, (document: PolicyDocument) => string> = {
  vehicleModel: () => 'Nissan Versa 2024',
  vehiclePlates: () => 'XKM-482-B',
  vehicleVin: () => '3N1CN7AP4KL882310',
  sumInsured: (document) => money(sumInsuredByType[document.policyType] ?? 0),
  deductible: () => '5%',
  beneficiaries: () => 'Ana Euan (100%)',
  coverageLevel: () => 'Amplio',
  bondType: () => 'Cumplimiento',
  bondedAmount: () => money(800000),
  propertyAddress: () => 'Av. Reforma 1200, CDMX',
  receiptPeriod: () => 'Ene - Mar 2026',
  paidAmount: () => money(12500),
}

export function buildManualFields(document: PolicyDocument): ExtractionField[] {
  const general = generalFieldDefinitions
    .filter((definition) => definition.enabled)
    .map((definition) => createFieldFromDefinition(definition))
  const specific = fieldsForPolicyType(document.policyType)
    .filter((definition) => definition.enabled)
    .map((definition) => createFieldFromDefinition(definition))
  const additional = additionalFieldDefinitions
    .filter((definition) => definition.enabled)
    .map((definition) => createFieldFromDefinition(definition))
  return [...general, ...specific, ...additional]
}

const detectedAdditionalDefinitions = [
  {
    key: 'renewalDate',
    label: 'Fecha de renovación',
    kind: 'date' as const,
  },
  {
    key: 'paymentReference',
    label: 'Referencia de pago',
    kind: 'text' as const,
  },
]

export function simulateGeminiFields(
  document: PolicyDocument,
): ExtractionField[] {
  const general = generalFieldDefinitions
    .filter((definition) => definition.enabled)
    .map((definition) => {
      let value = ''
      switch (definition.key) {
        case 'policyNumber':
          value = document.policyNumber
          break
        case 'insurer':
          value = document.insurer
          break
        case 'client':
          value = document.client
          break
        case 'startDate':
          value = document.receivedAt.slice(0, 10)
          break
        case 'endDate':
          value = addYears(document.receivedAt, 1)
          break
        case 'premium':
          value = money(sumInsuredByType[document.policyType] ?? 0)
          break
        case 'currency':
          value = 'MXN'
          break
        case 'paymentMethod':
          value = 'Anual'
          break
        default:
          value = ''
      }
      return withResolvedStatus(
        createFieldFromDefinition(definition, {
          value,
          source: 'gemini',
          confidence: confidenceFor(definition.key),
        }),
      )
    })

  const specific = fieldsForPolicyType(document.policyType)
    .filter((definition) => definition.enabled)
    .map((definition) => {
      const resolver = specificValues[definition.key]
      const value = resolver ? resolver(document) : ''
      return withResolvedStatus(
        createFieldFromDefinition(definition, {
          value,
          source: 'gemini',
          confidence: confidenceFor(definition.key),
        }),
      )
    })

  const blankTarget = [...specific].reverse().find((field) => field.required)
  if (blankTarget) {
    blankTarget.value = ''
    blankTarget.status = 'missing'
  }

  const additional = [
    ...additionalFieldDefinitions
      .filter((definition) => definition.enabled)
      .map((definition) => {
        const values: Record<string, string> = {
          agentName: 'Carlos Ramírez',
          agencyCode: 'AG-4471',
          observations: 'Documento escaneado, verificar legibilidad.',
        }
        return withResolvedStatus(
          createFieldFromDefinition(definition, {
            value: values[definition.key] ?? '',
            source: 'gemini',
            confidence: confidenceFor(definition.key),
          }),
        )
      }),
    ...detectedAdditionalDefinitions.map((definition) =>
      withResolvedStatus({
        key: definition.key,
        label: definition.label,
        kind: definition.kind,
        scope: 'additional' as const,
        value: document.receivedAt.slice(0, 10),
        source: 'gemini' as const,
        status: 'review' as const,
        required: false,
        confidence: 0.64,
        note: 'Detectado automáticamente',
      }),
    ),
  ]

  return [...general, ...specific, ...additional]
}
