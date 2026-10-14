import { Hand, Sparkles } from 'lucide-react'
import type { ExtractionMethod } from '@/types'
import { Badge } from '@/components/ui/Badge'

interface MethodBadgeProps {
  method: ExtractionMethod
}

export function MethodBadge({ method }: MethodBadgeProps) {
  if (method === 'gemini') {
    return (
      <Badge tone="brand">
        <Sparkles size={11} />
        Gemini AI
      </Badge>
    )
  }
  return (
    <Badge tone="neutral">
      <Hand size={11} />
      Manual
    </Badge>
  )
}
