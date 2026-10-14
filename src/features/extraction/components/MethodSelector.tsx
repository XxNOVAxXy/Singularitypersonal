import { Hand, Sparkles } from 'lucide-react'
import type { ExtractionMethod } from '@/types'
import { SegmentedControl } from '@/components/ui/SegmentedControl'

interface MethodSelectorProps {
  method: ExtractionMethod
  onChange: (method: ExtractionMethod) => void
}

export function MethodSelector({ method, onChange }: MethodSelectorProps) {
  return (
    <SegmentedControl
      value={method}
      onChange={onChange}
      options={[
        {
          value: 'manual',
          label: 'Manual',
          icon: <Hand size={15} />,
          hint: 'Captura y edición humana',
        },
        {
          value: 'gemini',
          label: 'Gemini AI',
          icon: <Sparkles size={15} />,
          hint: 'Extracción automática',
        },
      ]}
    />
  )
}
