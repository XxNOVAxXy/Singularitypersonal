import { Trash2 } from 'lucide-react'
import type { FieldDefinition, FieldKind } from '@/types'
import { fieldKindOptions } from '@/lib/fieldKinds'
import { cn } from '@/lib/cn'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface FieldDefinitionRowProps {
  definition: FieldDefinition
  onChange: (id: string, patch: Partial<FieldDefinition>) => void
  onDelete: (id: string) => void
}

export function FieldDefinitionRow({
  definition,
  onChange,
  onDelete,
}: FieldDefinitionRowProps) {
  return (
    <div
      className={cn(
        'grid items-center gap-3 border-b border-slate-100 py-3 last:border-b-0',
        'md:grid-cols-[80px_minmax(0,1fr)_130px_110px_auto]',
      )}
    >
      <button
        type="button"
        onClick={() => onChange(definition.id, { enabled: !definition.enabled })}
        className={cn(
          'inline-flex h-7 items-center justify-center rounded-full px-2 text-[11px] font-medium transition-colors',
          definition.enabled
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            : 'bg-slate-100 text-slate-400 ring-1 ring-slate-200',
        )}
      >
        {definition.enabled ? 'Activo' : 'Inactivo'}
      </button>

      <div className="min-w-0">
        <Input
          value={definition.label}
          onChange={(event) =>
            onChange(definition.id, { label: event.target.value })
          }
          className="h-8"
        />
        <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
          {definition.key}
        </p>
      </div>

      <Select
        value={definition.kind}
        onChange={(event) =>
          onChange(definition.id, { kind: event.target.value as FieldKind })
        }
        className="h-8"
      >
        {fieldKindOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>

      <label className="flex items-center gap-2 text-xs text-slate-600">
        <input
          type="checkbox"
          checked={definition.required}
          onChange={(event) =>
            onChange(definition.id, { required: event.target.checked })
          }
          className="h-4 w-4 rounded border-slate-300 text-graphite focus:ring-graphite"
        />
        Obligatorio
      </label>

      <button
        type="button"
        onClick={() => onDelete(definition.id)}
        className="justify-self-end rounded-md p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
        aria-label={`Eliminar ${definition.label}`}
      >
        <Trash2 size={15} />
      </button>
    </div>
  )
}
