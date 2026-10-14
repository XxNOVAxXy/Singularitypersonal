import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { FieldKind } from '@/types'
import { fieldKindOptions } from '@/lib/fieldKinds'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'

interface AddFieldFormProps {
  onAdd: (input: { label: string; kind: FieldKind }) => void
}

export function AddFieldForm({ onAdd }: AddFieldFormProps) {
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<FieldKind>('text')

  const handleSubmit = () => {
    const trimmed = label.trim()
    if (!trimmed) return
    onAdd({ label: trimmed, kind })
    setLabel('')
    setKind('text')
  }

  return (
    <div className="flex flex-col gap-2 border-t border-slate-100 py-4 sm:flex-row sm:items-center">
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Nombre del nuevo campo"
        onKeyDown={(event) => {
          if (event.key === 'Enter') handleSubmit()
        }}
      />
      <Select
        value={kind}
        onChange={(event) => setKind(event.target.value as FieldKind)}
        className="sm:w-40"
      >
        {fieldKindOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Button
        variant="secondary"
        icon={<Plus size={14} />}
        onClick={handleSubmit}
        disabled={!label.trim()}
      >
        Agregar campo
      </Button>
    </div>
  )
}
