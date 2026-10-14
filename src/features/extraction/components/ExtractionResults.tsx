import { AlertTriangle, CheckCircle2, FileWarning, ListChecks } from 'lucide-react'
import type { ExtractionMethod, PolicyDocument } from '@/types'
import type { ExtractionSummary } from '@/features/extraction/utils/extractionUtils'
import type { ExtractionStatus } from '@/features/extraction/utils/extractionState'
import { relativeTime } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { ProgressBar } from '@/components/ui/ProgressBar'
import { MethodBadge } from '@/components/domain/MethodBadge'

interface ExtractionResultsProps {
  summary: ExtractionSummary
  method: ExtractionMethod
  document: PolicyDocument | null
  lastRunAt: string | null
  status: ExtractionStatus
}

function methodLabel(method: ExtractionMethod, status: ExtractionStatus): string {
  if (method !== 'gemini') return 'Manual'
  if (status === 'extracting') return 'Gemini AI (procesando)'
  if (status === 'error') return 'Gemini AI (error)'
  return 'Gemini AI'
}

export function ExtractionResults({
  summary,
  method,
  document,
  lastRunAt,
  status,
}: ExtractionResultsProps) {
  const metrics = [
    {
      label: 'Capturados',
      value: summary.filled,
      icon: CheckCircle2,
      className: 'text-emerald-600',
    },
    {
      label: 'Faltantes',
      value: summary.missing,
      icon: FileWarning,
      className: 'text-rose-600',
    },
    {
      label: 'Por revisar',
      value: summary.review,
      icon: AlertTriangle,
      className: 'text-amber-600',
    },
  ]

  return (
    <Card
      title="Resultados"
      subtitle={document ? document.name : 'Sin documento seleccionado'}
      action={<MethodBadge method={method} />}
    >
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <ListChecks size={14} />
          Completado
        </span>
        <span className="font-semibold text-slate-700">
          {Math.round(summary.completion * 100)}%
        </span>
      </div>
      <ProgressBar
        value={summary.completion * 100}
        className="mt-2"
        barClassName={
          summary.missing > 0
            ? 'bg-amber-500'
            : summary.review > 0
              ? 'bg-brand-500'
              : 'bg-emerald-500'
        }
      />

      <div className="mt-4 grid grid-cols-3 gap-2">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-lg border border-slate-100 bg-slate-50/70 p-2.5 text-center"
          >
            <metric.icon size={15} className={`mx-auto ${metric.className}`} />
            <p className="mt-1 text-lg font-semibold text-slate-800">
              {metric.value}
            </p>
            <p className="text-[11px] text-slate-500">{metric.label}</p>
          </div>
        ))}
      </div>

      <dl className="mt-4 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <dt className="text-slate-500">Total de campos</dt>
          <dd className="font-medium text-slate-700">{summary.total}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Método</dt>
          <dd className="font-medium text-slate-700">
            {methodLabel(method, status)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-slate-500">Última ejecución</dt>
          <dd className="font-medium text-slate-700">
            {lastRunAt ? relativeTime(lastRunAt) : '—'}
          </dd>
        </div>
      </dl>
    </Card>
  )
}
