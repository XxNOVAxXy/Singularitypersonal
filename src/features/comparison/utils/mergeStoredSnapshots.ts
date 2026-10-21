import type { ExtractionMethod } from '../../../../shared/types.ts'

/** Etiqueta mínima compartida por los snapshots construidos en la UI. */
export interface MergeableSnapshot {
  id: string
  method: ExtractionMethod
}

const METHOD_ORDER: readonly ExtractionMethod[] = ['manual', 'gemini']

/**
 * Combina los snapshots guardados en el backend y en sessionStorage por
 * método. Cada método aparece exactamente una vez: el backend tiene
 * prioridad y la sesión solo aporta los métodos que faltan allí. Así una
 * fuente nunca hace desaparecer a la otra.
 */
export function mergeSnapshotsByMethod<T extends MergeableSnapshot>(
  backend: readonly T[],
  session: readonly T[],
): T[] {
  const byMethod = new Map<ExtractionMethod, T>()
  for (const snapshot of backend) {
    if (!byMethod.has(snapshot.method)) byMethod.set(snapshot.method, snapshot)
  }
  for (const snapshot of session) {
    if (!byMethod.has(snapshot.method)) byMethod.set(snapshot.method, snapshot)
  }
  return METHOD_ORDER.flatMap((method) => {
    const snapshot = byMethod.get(method)
    return snapshot ? [snapshot] : []
  })
}
