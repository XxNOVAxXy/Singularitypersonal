import {
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Sparkles,
  Trash2,
} from 'lucide-react'
import type { ExtractionField } from '@/types'
import { cn } from '@/lib/cn'
import { statusLabels } from '@/features/extraction/utils/extractionUtils'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'

interface FieldEditorRowProps {
  field: ExtractionField
  onChange: (key: string, value: string) => void
  onRemove?: (key: string) => void
}

const statusMeta = {
  ok: { tone: 'success' as const, icon: CheckCircle2 },
  review: { tone: 'warning' as const, icon: AlertTriangle },
  missing: { tone: 'danger' as const, icon: AlertTriangle },
}

export function FieldEditorRow({
  field,
  onChange,
  onRemove,
}: FieldEditorRowProps) {
  const status = statusMeta[field.status]
  const StatusIcon = status.icon

  const control = () => {
    if (field.kind === 'select') {
      return (
        <Select
          value={field.value}
          invalid={field.status === 'missing'}
          onChange={(event) => onChange(field.key, event.target.value)}
        >
          <option value="">Seleccionar…</option>
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      )
    }
    if (field.kind === 'boolean') {
      return (
        <Select
          value={field.value}
          onChange={(event) => onChange(field.key, event.target.value)}
        >
          <option value="">Seleccionar…</option>
          <option value="Sí">Sí</option>
          <option value="No">No</option>
        </Select>
      )
    }
    return (
      <div className="relative">
        {field.kind === 'currency' ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
            $
          </span>
        ) : null}
        <Input
          type={field.kind === 'date' ? 'date' : 'text'}
          inputMode={
            field.kind === 'number' || field.kind === 'currency'
              ? 'decimal'
              : undefined
          }
          value={field.value}
          invalid={field.status === 'missing'}
          placeholder={field.kind === 'date' ? undefined : 'Sin valor'}
          className={field.kind === 'currency' ? 'pl-7' : undefined}
          onChange={(event) => onChange(field.key, event.target.value)}
        />
      </div>
    )
  }

  return (
    <div
      className={cn(
        'grid items-center gap-3 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]',
        'border-b border-slate-100 last:border-b-0',
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-slate-700">
            {field.label}
          </span>
          {field.required ? (
            <span className="text-rose-500" title="Campo obligatorio">
              *
            </span>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {field.source === 'gemini' ? (
            <Badge tone="brand">
              <Sparkles size={10} />
              Gemini
            </Badge>
          ) : null}
          {field.source === 'user' ? (
            <Badge tone="neutral">
              <Pencil size={10} />
              Editado
            </Badge>
          ) : null}
          {field.note ? (
            <span className="text-[11px] text-slate-400">{field.note}</span>
          ) : null}
          {field.page || field.sourceRef ? (
            <span
              className="max-w-[260px] truncate text-[11px] text-slate-400"
              title={field.sourceRef}
            >
              {field.page ? `Pág. ${field.page}` : ''}
              {field.page && field.sourceRef ? ' · ' : ''}
              {field.sourceRef ?? ''}
            </span>
          ) : null}
        </div>
      </div>

      <div>{control()}</div>

      <div className="flex items-center justify-end gap-2">
        <Badge tone={status.tone}>
          <StatusIcon size={11} />
          {statusLabels[field.status]}
        </Badge>
        {onRemove ? (
          <button
            type="button"
            onClick={() => onRemove(field.key)}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
            aria-label={`Eliminar ${field.label}`}
          >
            <Trash2 size={15} />
          </button>
        ) : null}
      </div>
    </div>
  )
}
