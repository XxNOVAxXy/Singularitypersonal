import type { ExtractionSnapshot } from '@/types'

export type ComparisonStatus =
  | 'match'
  | 'different'
  | 'only_a'
  | 'only_b'
  | 'empty'

export interface ComparisonRow {
  key: string
  label: string
  valueA: string
  valueB: string
  status: ComparisonStatus
}

export interface ComparisonSummaryData {
  matches: number
  differences: number
  onlyA: number
  onlyB: number
  total: number
}

export function compareSnapshots(
  a: ExtractionSnapshot,
  b: ExtractionSnapshot,
): ComparisonRow[] {
  const mapA = new Map(a.fields.map((field) => [field.key, field]))
  const mapB = new Map(b.fields.map((field) => [field.key, field]))
  const keys = [...new Set([...mapA.keys(), ...mapB.keys()])]

  return keys.map((key) => {
    const fieldA = mapA.get(key)
    const fieldB = mapB.get(key)
    const valueA = fieldA?.value.trim() ?? ''
    const valueB = fieldB?.value.trim() ?? ''

    let status: ComparisonStatus
    if (!valueA && !valueB) status = 'empty'
    else if (valueA && !valueB) status = 'only_a'
    else if (!valueA && valueB) status = 'only_b'
    else if (valueA === valueB) status = 'match'
    else status = 'different'

    return {
      key,
      label: fieldA?.label ?? fieldB?.label ?? key,
      valueA,
      valueB,
      status,
    }
  })
}

export function summarizeComparison(
  rows: ComparisonRow[],
): ComparisonSummaryData {
  return rows.reduce<ComparisonSummaryData>(
    (accumulator, row) => {
      if (row.status === 'match') accumulator.matches += 1
      if (row.status === 'different') accumulator.differences += 1
      if (row.status === 'only_a') accumulator.onlyA += 1
      if (row.status === 'only_b') accumulator.onlyB += 1
      accumulator.total += 1
      return accumulator
    },
    { matches: 0, differences: 0, onlyA: 0, onlyB: 0, total: 0 },
  )
}

export const comparisonStatusMeta: Record<
  ComparisonStatus,
  { label: string; className: string }
> = {
  match: { label: 'Coincide', className: 'bg-emerald-50 text-emerald-700' },
  different: { label: 'Diferente', className: 'bg-rose-50 text-rose-700' },
  only_a: { label: 'Solo A', className: 'bg-amber-50 text-amber-700' },
  only_b: { label: 'Solo B', className: 'bg-sky-50 text-sky-700' },
  empty: { label: 'Sin datos', className: 'bg-slate-100 text-slate-500' },
}
