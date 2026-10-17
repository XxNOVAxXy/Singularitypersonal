import { useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Braces, Layers3, ListChecks, PlugZap, Settings2 } from 'lucide-react'
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
import { GmailApiKeySettings } from '@/features/settings/components/gmail_APIkey'

type SettingsTab = 'general' | 'policy' | 'additional' | 'api'

const tabs: Array<{ id: SettingsTab; label: string; icon: typeof Settings2 }> = [
  { id: 'general', label: 'Campos generales', icon: ListChecks },
  { id: 'policy', label: 'Por tipo de póliza', icon: Layers3 },
  { id: 'additional', label: 'Campos adicionales', icon: Braces },
  { id: 'api', label: 'Integraciones', icon: PlugZap },
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
        icon={<Settings2 size={22} strokeWidth={1.8} />}
        eyebrow="Administración"
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
              'inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab.id
                 ? 'bg-slate-100 text-ink ring-1 ring-slate-200'
                : 'text-slate-500 hover:bg-slate-100',
            )}
          >
            <tab.icon size={15} />
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

      {activeTab === 'api' ? <GmailApiKeySettings /> : null}
    </div>
  )
}
