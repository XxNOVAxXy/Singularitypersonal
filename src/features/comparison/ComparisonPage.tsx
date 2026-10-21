import { useEffect, useMemo, useState } from 'react'
import { GitCompare, GitCompareArrows, ListFilter } from 'lucide-react'
import type { ExtractionSnapshot } from '@/types'
import { documents } from '@/mocks/documents'
import { getSnapshotsForDocument } from '@/mocks/snapshots'
import { readStoredExtraction, canAdoptAsMethod } from '@/features/extraction/utils/extractionPersistence'
import {
  filterDeletedDocuments,
  isDemoMode,
  mergeCatalogDocuments,
  readDeletedDemoIds,
} from '@/features/extraction/utils/catalog'
import {
  getDocumentExtractions,
  loadCatalogDocuments,
  type StoredExtractionPayload,
} from '@/services/documentService'
import { cn } from '@/lib/cn'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { EmptyState } from '@/components/ui/EmptyState'
import { ResultPicker } from '@/features/comparison/components/ResultPicker'
import { ComparisonSummary } from '@/features/comparison/components/ComparisonSummary'
import { ComparisonTable } from '@/features/comparison/components/ComparisonTable'
import {
  compareSnapshots,
  summarizeComparison,
  type ComparisonRow,
} from '@/features/comparison/utils/compareResults'
import { mergeSnapshotsByMethod } from '@/features/comparison/utils/mergeStoredSnapshots'

type FilterValue = 'all' | 'differences' | 'matches' | 'missing'

const filterOptions: Array<{ value: FilterValue; label: string; icon: typeof ListFilter }> = [
  { value: 'all', label: 'Todos', icon: ListFilter },
  { value: 'differences', label: 'Diferentes', icon: GitCompareArrows },
  { value: 'matches', label: 'Coincidentes', icon: GitCompare },
  { value: 'missing', label: 'Faltantes', icon: ListFilter },
]

function applyFilter(rows: ComparisonRow[], filter: FilterValue): ComparisonRow[] {
  switch (filter) {
    case 'differences':
      return rows.filter((row) => row.status === 'different')
    case 'matches':
      return rows.filter((row) => row.status === 'match')
    case 'missing':
      return rows.filter(
        (row) => row.status === 'only_a' || row.status === 'only_b',
      )
    default:
      return rows.filter((row) => row.status !== 'empty')
  }
}

interface DocumentOption {
  id: string
  name: string
}

function buildStoredSnapshots(documentId: string): ExtractionSnapshot[] {
  const storage = typeof window === 'undefined' ? null : window.sessionStorage
  const snapshots: ExtractionSnapshot[] = []

  const manual = readStoredExtraction(documentId, 'manual', storage)
  // Una copia que en realidad contiene un resultado de Gemini no se presenta
  // como captura manual.
  if (manual && manual.fields.length > 0 && canAdoptAsMethod('manual', manual.fields)) {
    snapshots.push({
      id: `${documentId}-stored-manual`,
      documentId,
      method: 'manual',
      label: 'Captura manual (guardada)',
      analyst: 'Sesión actual',
      createdAt: manual.updatedAt,
      fields: manual.fields,
    })
  }

  const gemini = readStoredExtraction(documentId, 'gemini', storage)
  if (gemini && gemini.fields.length > 0) {
    snapshots.push({
      id: `${documentId}-stored-gemini`,
      documentId,
      method: 'gemini',
      label: 'Extracción Gemini (guardada)',
      analyst: 'Sesión actual',
      createdAt: gemini.updatedAt,
      fields: gemini.fields,
    })
  }

  return snapshots
}

function buildSnapshotsFromBackend(
  documentId: string,
  extractions: Record<string, StoredExtractionPayload>,
): ExtractionSnapshot[] {
  const snapshots: ExtractionSnapshot[] = []
  const methods = [
    { key: 'manual', label: 'Captura manual (guardada)' },
    { key: 'gemini', label: 'Extracción Gemini (guardada)' },
  ] as const
  for (const { key, label } of methods) {
    const entry = extractions[key]
    // El servidor puede guardar un resultado de Gemini bajo la clave manual;
    // no se presenta como captura manual.
    if (
      entry &&
      Array.isArray(entry.fields) &&
      entry.fields.length > 0 &&
      canAdoptAsMethod(key, entry.fields)
    ) {
      snapshots.push({
        id: `${documentId}-stored-${key}`,
        documentId,
        method: key,
        label,
        analyst: 'Servidor',
        createdAt: entry.updatedAt,
        fields: entry.fields,
      })
    }
  }
  return snapshots
}

export function ComparisonPage() {
  const [documentId, setDocumentId] = useState<string>(
    isDemoMode() ? (documents[0]?.id ?? '') : '',
  )
  const [storedDocuments, setStoredDocuments] = useState<DocumentOption[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [idA, setIdA] = useState('')
  const [idB, setIdB] = useState('')
  const [filter, setFilter] = useState<FilterValue>('all')

  useEffect(() => {
    let cancelled = false
    loadCatalogDocuments()
      .then(({ documents: records }) => {
        if (cancelled) return
        setStoredDocuments(records.map((record) => ({ id: record.id, name: record.filename })))
      })
      .catch((error) => {
        if (cancelled) return
        setStoredDocuments([])
        setCatalogError(
          error instanceof Error
            ? error.message
            : 'No se pudo cargar el catálogo de documentos.',
        )
      })
    return () => { cancelled = true }
  }, [])

  const deletedDemoIds = useMemo(() => readDeletedDemoIds(), [])

  const availableDocuments = useMemo<DocumentOption[]>(
    () => mergeCatalogDocuments(
      storedDocuments,
      filterDeletedDocuments(
        documents.map((document) => ({ id: document.id, name: document.name })),
        deletedDemoIds,
      ),
      isDemoMode(),
    ),
    [storedDocuments, deletedDemoIds],
  )

  const [backendSnapshots, setBackendSnapshots] = useState<ExtractionSnapshot[]>([])
  const [extractionsNotice, setExtractionsNotice] = useState<string | null>(null)

  const effectiveDocumentId = documentId || availableDocuments[0]?.id || ''

  useEffect(() => {
    if (!effectiveDocumentId) return
    let cancelled = false
    getDocumentExtractions(effectiveDocumentId)
      .then((extractions) => {
        if (cancelled) return
        setBackendSnapshots(buildSnapshotsFromBackend(effectiveDocumentId, extractions))
        setExtractionsNotice(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setBackendSnapshots([])
        setExtractionsNotice(
          error instanceof Error && error.message
            ? `No se pudieron cargar las extracciones del servidor (${error.message}). Se muestran las extracciones disponibles en esta sesión.`
            : 'No se pudieron cargar las extracciones del servidor. Se muestran las extracciones disponibles en esta sesión.',
        )
      })
    return () => { cancelled = true }
  }, [effectiveDocumentId])

  const storedSnapshots = useMemo(
    () => buildStoredSnapshots(effectiveDocumentId),
    [effectiveDocumentId],
  )

  const snapshots = useMemo(
    () => {
      // Combina backend y sesión por método: el backend tiene prioridad y la
      // sesión aporta los métodos que el backend no tiene guardados.
      const merged = mergeSnapshotsByMethod(backendSnapshots, storedSnapshots)
      if (merged.length > 0) return merged
      return isDemoMode() ? getSnapshotsForDocument(effectiveDocumentId) : []
    },
    [effectiveDocumentId, backendSnapshots, storedSnapshots],
  )

  const isDemoData =
    backendSnapshots.length === 0 &&
    storedSnapshots.length === 0 &&
    snapshots.length > 0

  useEffect(() => {
    setIdA(snapshots[0]?.id ?? '')
    setIdB(snapshots[1]?.id ?? '')
    setFilter('all')
  }, [snapshots])

  const snapshotA = snapshots.find((snapshot) => snapshot.id === idA)
  const snapshotB = snapshots.find((snapshot) => snapshot.id === idB)

  const rows = useMemo(() => {
    if (!snapshotA || !snapshotB) return []
    return compareSnapshots(snapshotA, snapshotB)
  }, [snapshotA, snapshotB])

  const summary = useMemo(() => summarizeComparison(rows), [rows])
  const visibleRows = useMemo(() => applyFilter(rows, filter), [rows, filter])

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<GitCompareArrows size={22} strokeWidth={1.8} />}
        eyebrow="Control de calidad"
        title="Comparación de resultados"
        description="Herramienta complementaria para contrastar dos extracciones de un mismo documento."
      />

      <Card bodyClassName="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Documento
            </p>
            <p className="mt-0.5 text-xs text-slate-400">
              Elige el documento cuyos resultados deseas comparar.
            </p>
          </div>
          <Select
            value={effectiveDocumentId}
            onChange={(event) => setDocumentId(event.target.value)}
            className="sm:w-80"
          >
            {availableDocuments.length === 0 ? (
              <option value="">Sin documentos</option>
            ) : null}
            {availableDocuments.map((document) => (
              <option key={document.id} value={document.id}>
                {document.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {catalogError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          No se pudo cargar el catálogo de documentos: {catalogError}
        </div>
      ) : null}

      {extractionsNotice ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
          {extractionsNotice}
        </div>
      ) : null}

      {snapshots.length < 2 ? (
        <EmptyState
          icon={<GitCompare size={26} />}
          title={snapshots.length === 1 ? 'Falta una extracción' : 'Sin extracciones guardadas'}
          description={
            snapshots.length === 1
              ? snapshots[0]?.method === 'manual'
                ? 'Solo hay una captura manual guardada para este documento. Ejecuta la extracción con Gemini para poder comparar ambos resultados.'
                : 'Solo hay una extracción Gemini guardada para este documento. Registra la captura manual para poder comparar ambos resultados.'
              : 'No hay extracciones guardadas para este documento en esta sesión. Ejecuta una extracción manual o con Gemini desde la pantalla de Extracción.'
          }
        />
      ) : (
        <>
          {isDemoData ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
              Datos de demostración: este documento no tiene extracciones guardadas en esta sesión; los resultados mostrados son simulados con fines ilustrativos.
            </div>
          ) : null}
          <div className="grid gap-4 lg:grid-cols-2">
            <ResultPicker
              title="Resultado A"
              snapshots={snapshots}
              value={idA}
              onChange={setIdA}
            />
            <ResultPicker
              title="Resultado B"
              snapshots={snapshots}
              value={idB}
              onChange={setIdB}
            />
          </div>

          <ComparisonSummary summary={summary} />

           <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 shadow-[0_1px_2px_rgba(28,30,34,0.04)]">
             <div className="flex items-center gap-2 px-2 text-xs font-semibold text-slate-500">
               <ListFilter size={14} />
               Filtrar resultados
             </div>
             {filterOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setFilter(option.value)}
                className={cn(
                   'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-colors',
                  filter === option.value
                     ? 'bg-slate-100 text-ink ring-1 ring-slate-200'
                    : 'text-slate-500 hover:bg-slate-100',
                )}
              >
                <option.icon size={13} />
                {option.label}
              </button>
            ))}
          </div>

          <ComparisonTable
            rows={visibleRows}
            labelA={snapshotA?.label ?? 'A'}
            labelB={snapshotB?.label ?? 'B'}
          />
        </>
      )}
    </div>
  )
}
