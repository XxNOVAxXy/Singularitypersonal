const dateFormatter = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
})

const dateTimeFormatter = new Intl.DateTimeFormat('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const timeFormatter = new Intl.DateTimeFormat('es-MX', {
  hour: '2-digit',
  minute: '2-digit',
})

export function formatDate(value: string | Date): string {
  return dateFormatter.format(new Date(value))
}

export function formatDateTime(value: string | Date): string {
  return dateTimeFormatter.format(new Date(value))
}

export function formatTime(value: string | Date): string {
  return timeFormatter.format(new Date(value))
}

export function relativeTime(value: string | Date): string {
  const target = new Date(value).getTime()
  const diff = Date.now() - target
  const minutes = Math.round(diff / 60000)
  if (minutes < 1) return 'hace unos segundos'
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `hace ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 7) return `hace ${days} d`
  return formatDate(value)
}

export function formatFileSize(sizeKb: number): string {
  if (sizeKb < 1024) return `${sizeKb} KB`
  return `${(sizeKb / 1024).toFixed(1)} MB`
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}
