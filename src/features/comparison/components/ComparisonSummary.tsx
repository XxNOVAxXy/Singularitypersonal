import { CheckCircle2, FileWarning, GitCompare, MinusCircle } from 'lucide-react'
import type { ComparisonSummaryData } from '@/features/comparison/utils/compareResults'

interface ComparisonSummaryProps {
  summary: ComparisonSummaryData
}

export function ComparisonSummary({ summary }: ComparisonSummaryProps) {
  const items = [
    {
      label: 'Coincidentes',
      value: summary.matches,
      icon: CheckCircle2,
      className: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Diferentes',
      value: summary.differences,
      icon: GitCompare,
      className: 'text-rose-600 bg-rose-50',
    },
    {
      label: 'Solo en A',
      value: summary.onlyA,
      icon: MinusCircle,
      className: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'Solo en B',
      value: summary.onlyB,
      icon: FileWarning,
       className: 'text-graphite bg-slate-100',
    },
  ]

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
        >
          <span
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${item.className}`}
          >
            <item.icon size={16} />
          </span>
          <div>
            <p className="text-xl font-semibold text-slate-800">{item.value}</p>
            <p className="text-xs text-slate-500">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
