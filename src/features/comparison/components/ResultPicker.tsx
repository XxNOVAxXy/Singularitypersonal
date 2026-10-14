import type { ExtractionSnapshot } from '@/types'
import { formatDateTime } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { MethodBadge } from '@/components/domain/MethodBadge'

interface ResultPickerProps {
  title: string
  snapshots: ExtractionSnapshot[]
  value: string
  onChange: (id: string) => void
}

export function ResultPicker({
  title,
  snapshots,
  value,
  onChange,
}: ResultPickerProps) {
  const selected = snapshots.find((snapshot) => snapshot.id === value)

  return (
    <Card title={title} bodyClassName="p-4">
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {snapshots.map((snapshot) => (
          <option key={snapshot.id} value={snapshot.id}>
            {snapshot.label} — {snapshot.analyst}
          </option>
        ))}
      </Select>

      {selected ? (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <MethodBadge method={selected.method} />
          <span>{selected.fields.length} campos</span>
          <span className="text-slate-300">·</span>
          <span>{formatDateTime(selected.createdAt)}</span>
        </div>
      ) : null}
    </Card>
  )
}
