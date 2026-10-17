import { useEffect, useMemo, useState } from 'react'
import { GitCompare, GitCompareArrows, ListFilter } from 'lucide-react'
import { documents } from '@/mocks/documents'
import { getSnapshotsForDocument } from '@/mocks/snapshots'
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

export function ComparisonPage() {
  const [documentId, setDocumentId] = useState<string>(documents[0]?.id ?? '')
  const [idA, setIdA] = useState('')
  const [idB, setIdB] = useState('')
  const [filter, setFilter] = useState<FilterValue>('all')

  const snapshots = useMemo(
    () => getSnapshotsForDocument(documentId),
    [documentId],
  )

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
            value={documentId}
            onChange={(event) => setDocumentId(event.target.value)}
            className="sm:w-80"
          >
            {documents.map((document) => (
              <option key={document.id} value={document.id}>
                {document.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {snapshots.length < 2 ? (
        <EmptyState
          icon={<GitCompare size={26} />}
          title="Sin resultados para comparar"
          description="Este documento solo tiene una extracción disponible."
        />
      ) : (
        <>
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
