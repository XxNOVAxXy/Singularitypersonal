import type { DocumentStatus } from '@/types'
import { Badge, type BadgeTone } from '@/components/ui/Badge'

interface DocumentStatusBadgeProps {
  status: DocumentStatus
}

const statusConfig: Record<
  DocumentStatus,
  { label: string; tone: BadgeTone }
> = {
  pending: { label: 'Pendiente', tone: 'warning' },
  in_review: { label: 'En revisión', tone: 'info' },
  reviewed: { label: 'Revisado', tone: 'success' },
  error: { label: 'Error', tone: 'danger' },
}

export function DocumentStatusBadge({ status }: DocumentStatusBadgeProps) {
  const config = statusConfig[status]
  return <Badge tone={config.tone}>{config.label}</Badge>
}
