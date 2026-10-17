import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { FieldKind } from '@/types'
import { fieldKindOptions } from '@/lib/fieldKinds'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface AddDefinitionFormProps {
  onAdd: (input: {
    label: string
    kind: FieldKind
    required: boolean
  }) => void
}

export function AddDefinitionForm({ onAdd }: AddDefinitionFormProps) {
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<FieldKind>('text')
  const [required, setRequired] = useState(false)

  const handleSubmit = () => {
    const trimmed = label.trim()
    if (!trimmed) return
    onAdd({ label: trimmed, kind, required })
    setLabel('')
    setKind('text')
    setRequired(false)
  }

  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 py-4 lg:flex-row lg:items-center">
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Nombre del campo"
        onKeyDown={(event) => {
          if (event.key === 'Enter') handleSubmit()
        }}
      />
      <Select
        value={kind}
        onChange={(event) => setKind(event.target.value as FieldKind)}
        className="lg:w-40"
      >
        {fieldKindOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <label className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-600">
        <input
          type="checkbox"
          checked={required}
          onChange={(event) => setRequired(event.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-graphite focus:ring-graphite"
        />
        Obligatorio
      </label>
      <Button
        variant="secondary"
        icon={<Plus size={14} />}
        onClick={handleSubmit}
        disabled={!label.trim()}
      >
        Agregar
      </Button>
    </div>
  )
}
