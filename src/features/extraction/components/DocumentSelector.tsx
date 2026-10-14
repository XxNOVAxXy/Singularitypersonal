import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { DocumentStatus, PolicyDocument } from '@/types'
import { cn } from '@/lib/cn'
import { relativeTime } from '@/lib/format'
import { FileTypeIcon } from '@/components/domain/FileTypeIcon'
import { DocumentStatusBadge } from '@/components/domain/DocumentStatusBadge'

interface DocumentSelectorProps {
  documents: PolicyDocument[]
  selectedId: string | null
  onSelect: (id: string) => void
}

type FilterValue = 'all' | DocumentStatus

export function DocumentSelector({
  documents,
  selectedId,
  onSelect,
}: DocumentSelectorProps) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterValue>('all')

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return documents.filter((document) => {
      const matchesFilter = filter === 'all' || document.status === filter
      const matchesTerm =
        !term ||
        document.name.toLowerCase().includes(term) ||
        document.insurer.toLowerCase().includes(term) ||
        document.client.toLowerCase().includes(term)
      return matchesFilter && matchesTerm
    })
  }, [documents, filter, query])

  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 p-4">
        <h3 className="text-sm font-semibold text-slate-800">
          Documentos
          <span className="ml-2 text-xs font-normal text-slate-400">
            {filtered.length} de {documents.length}
          </span>
        </h3>
        <div className="relative mt-3">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar documento…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none"
          />
        </div>
        <div className="mt-3 flex gap-1">
          {(
            [
              { value: 'all', label: 'Todos' },
              { value: 'pending', label: 'Pendientes' },
              { value: 'in_review', label: 'En revisión' },
              { value: 'reviewed', label: 'Revisados' },
            ] as Array<{ value: FilterValue; label: string }>
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setFilter(option.value)}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                filter === option.value
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-500 hover:bg-slate-100',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="flex-1 space-y-1 overflow-auto p-2" style={{ maxHeight: 520 }}>
        {filtered.length === 0 ? (
          <li className="px-3 py-8 text-center text-sm text-slate-400">
            Sin documentos para este filtro.
          </li>
        ) : (
          filtered.map((document) => {
            const active = document.id === selectedId
            return (
              <li key={document.id}>
                <button
                  type="button"
                  onClick={() => onSelect(document.id)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition-colors',
                    active
                      ? 'border-brand-200 bg-brand-50/70'
                      : 'border-transparent hover:bg-slate-50',
                  )}
                >
                  <FileTypeIcon fileType={document.fileType} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {document.name}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {document.insurer} · {document.client}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <DocumentStatusBadge status={document.status} />
                      <span className="text-[11px] text-slate-400">
                        {relativeTime(document.receivedAt)}
                      </span>
                    </div>
                  </div>
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}
