import type { FieldDefinition, FieldKind } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { FieldDefinitionRow } from '@/features/settings/components/FieldDefinitionRow'
import { AddDefinitionForm } from '@/features/settings/components/AddDefinitionForm'

interface AdditionalFieldsSettingsProps {
  definitions: FieldDefinition[]
  onChange: (id: string, patch: Partial<FieldDefinition>) => void
  onDelete: (id: string) => void
  onAdd: (input: { label: string; kind: FieldKind; required: boolean }) => void
}

export function AdditionalFieldsSettings({
  definitions,
  onChange,
  onDelete,
  onAdd,
}: AdditionalFieldsSettingsProps) {
  return (
    <Card
      title="Campos adicionales"
      subtitle="Campos complementarios que pueden aparecer en cualquier documento"
      action={<Badge tone="info">{definitions.length} campos</Badge>}
      bodyClassName="px-5 py-1"
    >
      {definitions.map((definition) => (
        <FieldDefinitionRow
          key={definition.id}
          definition={definition}
          onChange={onChange}
          onDelete={onDelete}
        />
      ))}
      <AddDefinitionForm onAdd={onAdd} />
    </Card>
  )
}
