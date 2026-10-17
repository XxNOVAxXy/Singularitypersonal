import type { FieldDefinition, FieldKind, PolicyType } from '@/types'
import { policyTypeConfigs } from '@/mocks/policyTypes'
import { cn } from '@/lib/cn'
import { Badge } from '@/components/ui/Badge'
import { Card } from '@/components/ui/Card'
import { FieldDefinitionRow } from '@/features/settings/components/FieldDefinitionRow'
import { AddDefinitionForm } from '@/features/settings/components/AddDefinitionForm'

interface PolicyTypeFieldsSettingsProps {
  definitions: FieldDefinition[]
  activeType: PolicyType
  onTypeChange: (type: PolicyType) => void
  onChange: (id: string, patch: Partial<FieldDefinition>) => void
  onDelete: (id: string) => void
  onAdd: (input: { label: string; kind: FieldKind; required: boolean }) => void
}

export function PolicyTypeFieldsSettings({
  definitions,
  activeType,
  onTypeChange,
  onChange,
  onDelete,
  onAdd,
}: PolicyTypeFieldsSettingsProps) {
  const visible = definitions.filter((definition) =>
    definition.policyTypes?.includes(activeType),
  )

  return (
    <Card
      title="Campos por tipo de póliza"
      subtitle="Define los campos específicos según el tipo de seguro"
      bodyClassName="px-5 py-1"
    >
      <div className="flex flex-wrap gap-1 border-b border-slate-100 py-3">
        {policyTypeConfigs.map((config) => (
          <button
            key={config.id}
            type="button"
            onClick={() => onTypeChange(config.id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
              activeType === config.id
                 ? 'bg-carbon text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            {config.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between py-3">
        <p className="text-xs text-slate-500">
          {
            policyTypeConfigs.find((config) => config.id === activeType)
              ?.description
          }
        </p>
        <Badge tone="brand">{visible.length} campos</Badge>
      </div>

      {visible.map((definition) => (
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
