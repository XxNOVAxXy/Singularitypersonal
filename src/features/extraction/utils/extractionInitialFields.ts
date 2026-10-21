import type { ExtractionField, ExtractionMethod } from '../../../../shared/types.ts'
import { canAdoptAsMethod, type DocumentFields } from './extractionPersistence.ts'

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
    // Una copia de sesión que en realidad contiene un resultado de Gemini no
    // se restaura como captura manual: se parte de la plantilla en blanco.
    if (
      storedFields &&
      storedFields.length > 0 &&
      canAdoptAsMethod(method, storedFields)
    ) {
      return { documentId, method, fields: storedFields, source: 'manual-restored' }
    }
    return { documentId, method, fields: blankManualFields, source: 'manual-blank' }
  }
  if (hasAttachment) {
    return { documentId, method, fields: [], source: 'attachment' }
  }
  if (storedFields && storedFields.length > 0) {
    return { documentId, method, fields: storedFields, source: 'stored' }
  }
  if (initialFields && initialFields.length > 0) {
    return { documentId, method, fields: initialFields, source: 'initial' }
  }
  return { documentId, method, fields: [], source: 'empty' }
}
