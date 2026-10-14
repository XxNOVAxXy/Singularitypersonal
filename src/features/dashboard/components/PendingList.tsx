import { Link } from 'react-router-dom'
import { ArrowRight, FileClock } from 'lucide-react'
import { documents } from '@/mocks/documents'
import { formatFileSize, relativeTime } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { FileTypeIcon } from '@/components/domain/FileTypeIcon'
import { DocumentStatusBadge } from '@/components/domain/DocumentStatusBadge'
import { PolicyTypeBadge } from '@/components/domain/PolicyTypeBadge'

export function PendingList() {
  const pending = documents
    .filter((document) => document.status !== 'reviewed')
    .sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )
    .slice(0, 5)

  return (
    <Card
      title="Pendientes de procesar"
      subtitle="Documentos que requieren extracción o revisión"
      bodyClassName="p-0"
    >
      <ul className="divide-y divide-slate-100">
        {pending.map((document) => (
          <li
            key={document.id}
            className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-slate-50"
          >
            <FileTypeIcon fileType={document.fileType} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">
                {document.name}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>{document.insurer}</span>
                <span className="text-slate-300">·</span>
                <span>{formatFileSize(document.sizeKb)}</span>
                <span className="text-slate-300">·</span>
                <span>{relativeTime(document.receivedAt)}</span>
              </div>
            </div>
            <div className="hidden items-center gap-2 sm:flex">
              <PolicyTypeBadge policyType={document.policyType} />
              <DocumentStatusBadge status={document.status} />
            </div>
            <Link
              to={`/extraccion?document=${document.id}`}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-slate-700 ring-1 ring-slate-300 transition-colors hover:bg-slate-50"
            >
              <FileClock size={14} />
              Procesar
            </Link>
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-100 px-5 py-3">
        <Link
          to="/extraccion"
          className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Ir al módulo de extracción
          <ArrowRight size={14} />
        </Link>
      </div>
    </Card>
  )
}
