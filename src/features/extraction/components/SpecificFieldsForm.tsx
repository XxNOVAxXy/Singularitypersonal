import type { ExtractionField, PolicyType } from '@/types'
import { policyTypeLabel } from '@/mocks/policyTypes'
import { Badge } from '@/components/ui/Badge'
import { FieldSection } from '@/features/extraction/components/FieldSection'
import { FieldEditorRow } from '@/features/extraction/components/FieldEditorRow'

interface SpecificFieldsFormProps {
  fields: ExtractionField[]
  policyType: PolicyType
  onChange: (key: string, value: string) => void
  onRemove: (key: string) => void
}

export function SpecificFieldsForm({
  fields,
  policyType,
  onChange,
  onRemove,
}: SpecificFieldsFormProps) {
  return (
    <FieldSection
      title="Campos específicos"
      description={`Aplicables a pólizas de ${policyTypeLabel(policyType)}`}
      badge={<Badge tone="brand">{policyTypeLabel(policyType)}</Badge>}
    >
      {fields.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          No hay campos específicos configurados para este tipo de póliza.
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
