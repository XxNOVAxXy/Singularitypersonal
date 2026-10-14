import { AlertTriangle, CheckCircle2, FileWarning } from 'lucide-react'
import type { ExtractionField } from '@/types'
import { statusLabels } from '@/features/extraction/utils/extractionUtils'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'

interface ReviewPanelProps {
  fields: ExtractionField[]
  onChange: (key: string, value: string) => void
}

export function ReviewPanel({ fields, onChange }: ReviewPanelProps) {
  return (
    <Card
      title="Revisión y validación"
      subtitle="Datos faltantes y valores que requieren confirmación"
      action={
        <Badge tone={fields.length === 0 ? 'success' : 'warning'}>
          {fields.length === 0 ? 'Todo en orden' : `${fields.length} pendientes`}
        </Badge>
      }
      bodyClassName={fields.length === 0 ? 'p-5' : 'p-3'}
    >
      {fields.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 size={24} className="text-emerald-500" />
          <p className="text-sm text-slate-500">
            No hay datos faltantes ni por revisar.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {fields.map((field) => (
            <li
              key={field.key}
              className="rounded-lg border border-slate-100 bg-slate-50/60 p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                  {field.status === 'missing' ? (
                    <FileWarning size={13} className="text-rose-500" />
                  ) : (
                    <AlertTriangle size={13} className="text-amber-500" />
                  )}
                  {field.label}
                </span>
                <Badge tone={field.status === 'missing' ? 'danger' : 'warning'}>
                  {statusLabels[field.status]}
                </Badge>
              </div>
              <Input
                value={field.value}
                placeholder="Captura el valor correcto…"
                className="mt-2 h-8 text-xs"
                invalid={field.status === 'missing'}
                onChange={(event) => onChange(field.key, event.target.value)}
              />
              {field.note ? (
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {field.note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
