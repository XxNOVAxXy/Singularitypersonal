import type { ExtractionField } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { FieldSection } from '@/features/extraction/components/FieldSection'
import { FieldEditorRow } from '@/features/extraction/components/FieldEditorRow'

interface GeneralFieldsFormProps {
  fields: ExtractionField[]
  onChange: (key: string, value: string) => void
  onRemove: (key: string) => void
}

export function GeneralFieldsForm({
  fields,
  onChange,
  onRemove,
}: GeneralFieldsFormProps) {
  return (
    <FieldSection
      title="Datos generales"
      description="Información común a cualquier póliza"
      badge={<Badge tone="neutral">{fields.length} campos</Badge>}
    >
      {fields.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          No hay campos generales habilitados.
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
    </FieldSection>
  )
}
