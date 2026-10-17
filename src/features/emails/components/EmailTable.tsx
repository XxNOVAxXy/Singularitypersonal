
import { FileText, Mail, Paperclip } from 'lucide-react'
import type { EmailMessage } from '@/types'

interface EmailTableProps {
  emails: EmailMessage[]
  selectedId: string | null
  onSelect: (email: EmailMessage) => void
}

function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()

  return letters || '??'
}

function receivedLabel(email: EmailMessage): string {
  if (email.receivedLabel) return email.receivedLabel

  const date = new Date(email.receivedAt)

  return Number.isNaN(date.getTime())
    ? email.receivedAt
    : new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        month: 'short',
      }).format(date)
}

function avatarColor(name: string): string {
  const palettes = [
    'bg-slate-200 text-slate-700',
    'bg-slate-100 text-graphite',
    'bg-stone-100 text-stone-700',
    'bg-zinc-200 text-zinc-700',
    'bg-neutral-100 text-neutral-700',
  ]

  const hash = Array.from(name).reduce(
    (total, character) => total + character.charCodeAt(0),
    0,
  )

  return palettes[hash % palettes.length]
}

export function EmailTable({
  emails,
  selectedId,
  onSelect,
}: EmailTableProps) {
  if (!emails.length) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center px-6 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-graphite">
          <Mail size={28} strokeWidth={1.6} />
        </div>

        <h3 className="text-base font-semibold text-slate-900">
          No hay correos para mostrar
        </h3>

        <p className="mt-2 max-w-xs text-sm leading-relaxed text-slate-500">
          No encontramos mensajes que coincidan con tu búsqueda.
          Prueba cambiando los filtros.
        </p>
      </div>
    )
  }

  return (
    <div
      className="flex flex-col"
      aria-label="Lista de correos"
    >
      {emails.map((email) => {
        const isSelected = selectedId === email.id
        const isUnread = !email.read
        const attachmentsCount = email.attachments.length
        const hasAttachments =
          email.hasAttachments || attachmentsCount > 0

        return (
          <button
            key={email.id}
            type="button"
            onClick={() => onSelect(email)}
            aria-current={isSelected ? 'true' : undefined}
            className={[
              'group relative flex w-full items-start gap-3',
              'border-b border-slate-100 px-4 py-4 text-left',
              'transition-colors duration-200',
               'focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-graphite',
              isSelected
                 ? 'bg-slate-100/90'
                : 'bg-white hover:bg-slate-50',
            ].join(' ')}
          >
            {isSelected && (
               <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-graphite" />
            )}

            <div className="relative shrink-0">
              <div
                className={[
                  'flex h-11 w-11 items-center justify-center',
                  'rounded-xl text-xs font-bold',
                  avatarColor(email.fromName || email.fromEmail),
                ].join(' ')}
              >
                {initials(email.fromName || email.fromEmail)}
              </div>

              {isUnread && (
                <span
                   className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-graphite"
                  aria-label="Correo sin leer"
                />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={[
                    'truncate text-[13px]',
                    isUnread
                      ? 'font-bold text-slate-950'
                      : 'font-semibold text-slate-700',
                  ].join(' ')}
                  title={email.fromName}
                >
                  {email.fromName || email.fromEmail}
                </span>

                <time
                  dateTime={email.receivedAt}
                  className={[
                    'shrink-0 text-[11px]',
                    isUnread
                       ? 'font-semibold text-graphite'
                      : 'text-slate-400',
                  ].join(' ')}
                >
                  {receivedLabel(email)}
                </time>
              </div>

              <div className="mt-1 flex items-center justify-between gap-2">
                <p
                  className={[
                    'min-w-0 truncate text-[13px]',
                    isUnread
                      ? 'font-semibold text-slate-900'
                      : 'font-medium text-slate-700',
                  ].join(' ')}
                  title={email.subject}
                >
                  {email.subject || '(Sin asunto)'}
                </p>

                {hasAttachments && (
                  <span
                    className="flex shrink-0 items-center gap-1 text-slate-400"
                    title={`${attachmentsCount} archivos adjuntos`}
                  >
                    <Paperclip size={14} />
                    {attachmentsCount > 0 && (
                      <span className="text-[10px]">
                        {attachmentsCount}
                      </span>
                    )}
                  </span>
                )}
              </div>

              <p
                className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500"
                title={email.preview || 'Sin contenido de texto'}
              >
                {email.preview || 'Sin contenido de texto'}
              </p>

              {email.attachments.some(
                (attachment) =>
                  attachment.isPdf ||
                  attachment.fileType === 'pdf',
              ) && (
                <div className="mt-2.5">
                   <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-[10px] font-semibold text-graphite">
                    <FileText size={12} />
                    Documento PDF
                  </span>
                </div>
              )}
            </div>
          </button>
        )
      })}
    </div>
  )
}
