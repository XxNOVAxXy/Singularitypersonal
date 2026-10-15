import { useState } from 'react'
import { ChevronLeft, ChevronRight, Eye, FileSearch } from 'lucide-react'
import type { PolicyDocument } from '@/types'
import { cn } from '@/lib/cn'
import { formatDate, formatFileSize } from '@/lib/format'
import { policyTypeLabel } from '@/mocks/policyTypes'
import { PolicyTypeBadge } from '@/components/domain/PolicyTypeBadge'
import { EmptyState } from '@/components/ui/EmptyState'

interface DocumentViewerProps {
  document: PolicyDocument | null
}

function SimulatedPage({ document }: { document: PolicyDocument }) {
  return (
    <div className="mx-auto w-full max-w-md rounded-lg bg-white p-6 shadow-md ring-1 ring-slate-200">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-900 text-[10px] font-bold text-white">
          {document.insurer.slice(0, 3).toUpperCase()}
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-widest text-slate-400">
            Póliza
          </p>
          <p className="text-xs font-semibold text-slate-700">
            {policyTypeLabel(document.policyType)}
          </p>
        </div>
      </div>

      <div className="mt-5 border-b border-slate-200 pb-3">
        <p className="text-sm font-semibold text-slate-800">
          {document.insurer}
        </p>
        <p className="text-[11px] text-slate-400">{document.client}</p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[11px]">
        <div>
          <dt className="text-slate-400">No. de póliza</dt>
          <dd className="font-medium text-slate-700">{document.policyNumber}</dd>
        </div>
        <div>
          <dt className="text-slate-400">Vigencia</dt>
          <dd className="font-medium text-slate-700">
            {formatDate(document.receivedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Tipo</dt>
          <dd className="font-medium text-slate-700">
            {policyTypeLabel(document.policyType)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Páginas</dt>
          <dd className="font-medium text-slate-700">{document.pages}</dd>
        </div>
      </dl>

      <div className="mt-5 space-y-2">
        {[0.95, 0.85, 0.7, 0.9, 0.6].map((width, index) => (
          <div
            key={index}
            className="h-2 rounded-full bg-slate-100"
            style={{ width: `${width * 100}%` }}
          />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className="h-12 rounded-md border border-dashed border-slate-200 bg-slate-50"
          />
        ))}
      </div>
    </div>
  )
}

export function DocumentViewer({ document }: DocumentViewerProps) {
  const [page, setPage] = useState(1)

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <EmptyState
          icon={<FileSearch size={28} />}
          title="Selecciona un documento"
          description="Elige un archivo de la lista para visualizarlo y extraer su información."
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-800">
            {document.name}
          </p>
          <p className="text-[11px] text-slate-400">
            {formatFileSize(document.sizeKb)} · {document.pages} pág.
          </p>
        </div>
        <PolicyTypeBadge policyType={document.policyType} />
      </header>

      <div className={`flex items-center justify-center overflow-hidden bg-slate-100 ${document.previewUrl ? 'flex-none p-2' : 'min-h-[620px] flex-1 p-4'}`}>
        {document.previewUrl ? (
          <iframe
            src={document.previewUrl}
            title={`Vista previa de ${document.name}`}
            className="block h-[min(72vh,760px)] min-h-[440px] w-full rounded-lg border-0 bg-white shadow-md"
          />
        ) : (
          <SimulatedPage document={document} />
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-slate-100 px-5 py-2.5">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          <Eye size={13} />
          {document.previewUrl ? 'Documento original desde Gmail' : 'Vista de demostración'}
        </span>
        {document.previewUrl ? (
          <a href={document.downloadUrl ?? document.previewUrl} download={document.name} className="text-xs font-medium text-brand-600 hover:text-brand-700">
            Descargar PDF
          </a>
        ) : (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40">
              <ChevronLeft size={16} />
            </button>
            <span className={cn('min-w-16 text-center text-xs text-slate-500')}>Página {page} / {document.pages}</span>
            <button type="button" onClick={() => setPage((current) => Math.min(document.pages, current + 1))} disabled={page === document.pages} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
          </div>
        )}
      </footer>
    </div>
  )
}
