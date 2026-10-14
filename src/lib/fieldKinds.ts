import type { FieldKind } from '@/types'

export const fieldKindOptions: Array<{ value: FieldKind; label: string }> = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'currency', label: 'Moneda' },
  { value: 'date', label: 'Fecha' },
  { value: 'boolean', label: 'Sí / No' },
]

export function fieldKindLabel(kind: FieldKind): string {
  return (
    fieldKindOptions.find((option) => option.value === kind)?.label ??
    kind
  )
}
