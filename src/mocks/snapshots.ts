import type { ExtractionField, ExtractionSnapshot } from '@/types'
import { getDocumentById } from '@/mocks/documents'
import { simulateGeminiFields } from '@/mocks/extraction'

function tweak(field: ExtractionField, index: number): ExtractionField {
  const mode = index % 4
  if (field.value.trim().length === 0) {
    return { ...field, source: 'manual' }
  }
  if (mode === 0) {
    return {
      ...field,
      value: `${field.value} (verificado)`,
      source: 'manual',
      confidence: undefined,
    }
  }
  if (mode === 1) {
    return {
      ...field,
      value: '',
      source: 'manual',
      confidence: undefined,
      status: field.required ? 'missing' : 'ok',
    }
  }
  return { ...field, source: 'manual', confidence: undefined, status: 'ok' }
}

export function getSnapshotsForDocument(
  documentId: string,
): ExtractionSnapshot[] {
  const document = getDocumentById(documentId)
  if (!document) return []

  const geminiFields = simulateGeminiFields(document)
  const manualFields = geminiFields.map(tweak)

  return [
    {
      id: `${documentId}-snap-gemini`,
      documentId,
      method: 'gemini',
      label: 'Extracción Gemini AI',
      analyst: 'Motor Gemini (simulado)',
      createdAt: document.receivedAt,
      fields: geminiFields,
    },
    {
      id: `${documentId}-snap-manual`,
      documentId,
      method: 'manual',
      label: 'Captura manual',
      analyst: 'Laura Domínguez',
      createdAt: document.receivedAt,
      fields: manualFields,
    },
  ]
}
