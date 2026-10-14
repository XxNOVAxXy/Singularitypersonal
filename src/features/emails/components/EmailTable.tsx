import { Paperclip } from 'lucide-react'
import type { EmailMessage } from '@/types'
import { formatDate, formatTime } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Card } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'

interface EmailTableProps {
  emails: EmailMessage[]
  selectedId: string | null
  onSelect: (id: string) => void
}

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

export function EmailTable({ emails, selectedId, onSelect }: EmailTableProps) {
  if (emails.length === 0) {
    return (
      <Card bodyClassName="p-5">
        <EmptyState
          title="Sin resultados"
          description="No se encontraron correos con los filtros actuales."
        />
      </Card>
    )
  }

  return (
    <Card bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-5 py-3 font-medium">Remitente</th>
              <th className="px-5 py-3 font-medium">Asunto</th>
              <th className="hidden px-5 py-3 font-medium md:table-cell">
                Fecha
              </th>
              <th className="px-5 py-3 text-center font-medium">Adjuntos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {emails.map((email) => {
              const active = email.id === selectedId
              return (
                <tr
                  key={email.id}
                  onClick={() => onSelect(email.id)}
                  className={cn(
                    'cursor-pointer transition-colors',
                    active ? 'bg-brand-50/70' : 'hover:bg-slate-50',
                  )}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-semibold text-slate-600">
                        {initials(email.fromName)}
                      </span>
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 truncate font-medium text-slate-800">
                          {!email.read ? (
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />
                          ) : null}
                          {email.fromName}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {email.fromEmail}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-[280px] px-5 py-3">
                    <p className="truncate font-medium text-slate-700">
                      {email.subject}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {email.preview}
                    </p>
                  </td>
                  <td className="hidden whitespace-nowrap px-5 py-3 text-xs text-slate-500 md:table-cell">
                    <p>{formatDate(email.receivedAt)}</p>
                    <p className="text-slate-400">{formatTime(email.receivedAt)}</p>
                  </td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                      <Paperclip size={13} />
                      {email.attachments.length}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
