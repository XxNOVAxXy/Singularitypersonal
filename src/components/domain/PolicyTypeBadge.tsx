import type { PolicyType } from '@/types'
import { policyTypeLabel } from '@/mocks/policyTypes'
import { Badge } from '@/components/ui/Badge'

interface PolicyTypeBadgeProps {
  policyType: PolicyType
}

export function PolicyTypeBadge({ policyType }: PolicyTypeBadgeProps) {
  return <Badge tone="brand">{policyTypeLabel(policyType)}</Badge>
}
