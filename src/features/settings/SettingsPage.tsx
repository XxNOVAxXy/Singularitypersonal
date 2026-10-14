import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { FieldDefinition, FieldKind, PolicyType } from '@/types'
import { createId, toFieldKey } from '@/lib/slug'
import { cn } from '@/lib/cn'
import {
  additionalFieldDefinitions,
  generalFieldDefinitions,
  specificFieldDefinitions,
} from '@/mocks/fieldDefinitions'
import { PageHeader } from '@/components/ui/PageHeader'
import { GeneralFieldsSettings } from '@/features/settings/components/GeneralFieldsSettings'
import { PolicyTypeFieldsSettings } from '@/features/settings/components/PolicyTypeFieldsSettings'
import { AdditionalFieldsSettings } from '@/features/settings/components/AdditionalFieldsSettings'

type SettingsTab = 'general' | 'policy' | 'additional'

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: 'general', label: 'Campos generales' },
  { id: 'policy', label: 'Por tipo de póliza' },
  { id: 'additional', label: 'Campos adicionales' },
]

interface NewFieldInput {
  label: string
  kind: FieldKind
  required: boolean
}

function patchList(
  setter: Dispatch<SetStateAction<FieldDefinition[]>>,
) {
  return (id: string, patch: Partial<FieldDefinition>) =>
    setter((current) =>
      current.map((definition) =>
        definition.id === id ? { ...definition, ...patch } : definition,
      ),
    )
}

function removeFromList(
  setter: Dispatch<SetStateAction<FieldDefinition[]>>,
) {
  return (id: string) =>
    setter((current) => current.filter((definition) => definition.id !== id))
}

export function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [activeType, setActiveType] = useState<PolicyType>('auto')
  const [general, setGeneral] = useState(generalFieldDefinitions)
  const [specific, setSpecific] = useState(specificFieldDefinitions)
  const [additional, setAdditional] = useState(additionalFieldDefinitions)

  const buildDefinition = (
    input: NewFieldInput,
    scope: FieldDefinition['scope'],
    policyTypes?: PolicyType[],
  ): FieldDefinition => ({
    id: createId(scope),
    key: toFieldKey(input.label),
    label: input.label,
    kind: input.kind,
    scope,
    policyTypes,
    required: input.required,
    enabled: true,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        description="Administra la estructura de campos utilizada por el módulo de extracción."
      />

      <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'rounded-md px-4 py-2 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-500 hover:bg-slate-100',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' ? (
        <GeneralFieldsSettings
          definitions={general}
          onChange={patchList(setGeneral)}
          onDelete={removeFromList(setGeneral)}
          onAdd={(input) =>
            setGeneral((current) => [
              ...current,
              buildDefinition(input, 'general'),
            ])
          }
        />
      ) : null}

      {activeTab === 'policy' ? (
        <PolicyTypeFieldsSettings
          definitions={specific}
          activeType={activeType}
          onTypeChange={setActiveType}
          onChange={patchList(setSpecific)}
          onDelete={removeFromList(setSpecific)}
          onAdd={(input) =>
            setSpecific((current) => [
              ...current,
              buildDefinition(input, 'specific', [activeType]),
            ])
          }
        />
      ) : null}

      {activeTab === 'additional' ? (
        <AdditionalFieldsSettings
          definitions={additional}
          onChange={patchList(setAdditional)}
          onDelete={removeFromList(setAdditional)}
          onAdd={(input) =>
            setAdditional((current) => [
              ...current,
              buildDefinition(input, 'additional'),
            ])
          }
        />
      ) : null}
    </div>
  )
}
