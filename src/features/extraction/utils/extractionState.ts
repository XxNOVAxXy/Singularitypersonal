export type ExtractionStatus = 'ready' | 'extracting' | 'done' | 'error'

export interface ExtractionRunState {
  status: ExtractionStatus
  error: string | null
}

export type ExtractionRunAction =
  | { type: 'start' }
  | { type: 'succeed' }
  | { type: 'fail'; message: string }
  | { type: 'reset' }

export const initialExtractionRunState: ExtractionRunState = {
  status: 'ready',
  error: null,
}

/**
 * Máquina de estados pura de una ejecución de extracción.
 * `start` es idempotente mientras se está procesando, lo que evita
 * transiciones duplicadas por clics repetidos.
 */
export function reduceExtractionRunState(
  state: ExtractionRunState,
  action: ExtractionRunAction,
): ExtractionRunState {
  switch (action.type) {
    case 'start':
      if (state.status === 'extracting') return state
      return { status: 'extracting', error: null }
    case 'succeed':
      return { status: 'done', error: null }
    case 'fail':
      return { status: 'error', error: action.message }
    case 'reset':
      return { status: 'ready', error: null }
    default:
      return state
  }
}

export function canRunExtraction(state: ExtractionRunState): boolean {
  return state.status !== 'extracting'
}

export function isExtractionBusy(state: ExtractionRunState): boolean {
  return state.status === 'extracting'
}
