import type { ExtractionField, ExtractionMethod } from '../../../../shared/types.ts'
import type { DocumentFields } from './extractionPersistence.ts'

export type InitialFieldsSource =
  | 'manual-restored'
  | 'manual-blank'
  | 'attachment'
  | 'stored'
  | 'initial'
  | 'empty'

export interface InitialFieldsInput {
  documentId: string
  method: ExtractionMethod
  storedFields: ExtractionField[] | null
  hasAttachment: boolean
  initialFields: ExtractionField[] | null
  blankManualFields: ExtractionField[]
}

export interface InitialFieldsResolution extends DocumentFields {
  source: InitialFieldsSource
}

export function resolveInitialFields(input: InitialFieldsInput): InitialFieldsResolution {
  const { documentId, method, storedFields, hasAttachment, initialFields, blankManualFields } = input
  if (method === 'manual') {
    if (storedFields && storedFields.length > 0) {
      return { documentId, fields: storedFields, source: 'manual-restored' }
    }
    return { documentId, fields: blankManualFields, source: 'manual-blank' }
  }
  if (hasAttachment) {
    return { documentId, fields: [], source: 'attachment' }
  }
  if (storedFields && storedFields.length > 0) {
    return { documentId, fields: storedFields, source: 'stored' }
  }
  if (initialFields && initialFields.length > 0) {
    return { documentId, fields: initialFields, source: 'initial' }
  }
  return { documentId, fields: [], source: 'empty' }
}
