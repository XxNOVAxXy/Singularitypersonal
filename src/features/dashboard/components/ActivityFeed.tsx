import {
  AlertTriangle,
  CheckCircle2,
  Mail,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { activity } from '@/mocks/dashboard'
import { relativeTime } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import type { ActivityEntry } from '@/types'

const iconByKind: Record<ActivityEntry['kind'], LucideIcon> = {
  received: Mail,
  extracted: Sparkles,
  reviewed: CheckCircle2,
  error: AlertTriangle,
}

const toneByKind: Record<ActivityEntry['kind'], string> = {
  received: 'bg-sky-50 text-sky-600',
  extracted: 'bg-brand-50 text-brand-600',
  reviewed: 'bg-emerald-50 text-emerald-600',
  error: 'bg-amber-50 text-amber-600',
}

export function ActivityFeed() {
  return (
    <Card title="Actividad reciente" subtitle="Últimos movimientos del sistema">
      <ol className="relative space-y-4 border-l border-slate-200 pl-5">
        {activity.map((entry) => {
          const Icon = iconByKind[entry.kind]
          return (
            <li key={entry.id} className="relative">
              <span
                className={`absolute -left-[30px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${toneByKind[entry.kind]}`}
              >
                <Icon size={13} />
              </span>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {entry.title}
                  </p>
                  <p className="text-xs text-slate-500">{entry.description}</p>
                </div>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {relativeTime(entry.timestamp)}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
