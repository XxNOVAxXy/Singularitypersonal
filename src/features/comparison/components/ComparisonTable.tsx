import type { ComparisonRow } from '@/features/comparison/utils/compareResults'
import { comparisonStatusMeta } from '@/features/comparison/utils/compareResults'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'

interface ComparisonTableProps {
  rows: ComparisonRow[]
  labelA: string
  labelB: string
}

export function ComparisonTable({ rows, labelA, labelB }: ComparisonTableProps) {
  return (
    <Card bodyClassName="p-0">
      {rows.length === 0 ? (
        <div className="p-5">
          <EmptyState
            title="Sin diferencias"
            description="No hay campos que coincidan con el filtro seleccionado."
          />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-5 py-3 font-medium">Campo</th>
                <th className="px-5 py-3 font-medium">{labelA}</th>
                <th className="px-5 py-3 font-medium">{labelB}</th>
                <th className="px-5 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => {
                const meta = comparisonStatusMeta[row.status]
                return (
                  <tr key={row.key} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-700">
                      {row.label}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {row.valueA || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-600">
                      {row.valueB || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium',
                          meta.className,
                        )}
                      >
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
