import type { FieldDefinition, FieldKind } from '@/types'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { FieldDefinitionRow } from '@/features/settings/components/FieldDefinitionRow'
import { AddDefinitionForm } from '@/features/settings/components/AddDefinitionForm'

interface GeneralFieldsSettingsProps {
  definitions: FieldDefinition[]
  onChange: (id: string, patch: Partial<FieldDefinition>) => void
  onDelete: (id: string) => void
  onAdd: (input: { label: string; kind: FieldKind; required: boolean }) => void
}

export function GeneralFieldsSettings({
  definitions,
  onChange,
  onDelete,
  onAdd,
}: GeneralFieldsSettingsProps) {
  return (
    <Card
      title="Campos generales"
      subtitle="Aplican a todos los tipos de póliza"
      action={<Badge tone="neutral">{definitions.length} campos</Badge>}
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
