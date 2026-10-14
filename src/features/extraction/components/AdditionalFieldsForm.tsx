import type { ExtractionField, FieldKind } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { FieldSection } from '@/features/extraction/components/FieldSection'
import { FieldEditorRow } from '@/features/extraction/components/FieldEditorRow'
import { AddFieldForm } from '@/features/extraction/components/AddFieldForm'

interface AdditionalFieldsFormProps {
  fields: ExtractionField[]
  onChange: (key: string, value: string) => void
  onRemove: (key: string) => void
  onAdd: (input: { label: string; kind: FieldKind }) => void
}

export function AdditionalFieldsForm({
  fields,
  onChange,
  onRemove,
  onAdd,
}: AdditionalFieldsFormProps) {
  return (
    <FieldSection
      title="Campos adicionales"
      description="Detectados automáticamente o agregados por el analista"
      badge={<Badge tone="info">{fields.length} campos</Badge>}
    >
      {fields.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Aún no hay campos adicionales. Agrega uno debajo.
        </p>
      ) : (
        fields.map((field) => (
          <FieldEditorRow
            key={field.key}
            field={field}
            onChange={onChange}
            onRemove={onRemove}
          />
        ))
      )}
      <AddFieldForm onAdd={onAdd} />
    </FieldSection>
  )
}
