import { FileText, Mail } from 'lucide-react'
import type { EmailMessage } from '@/types'

interface EmailTableProps {
  emails: EmailMessage[]
  selectedId: string | null
  onSelect: (email: EmailMessage) => void
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function receivedLabel(email: EmailMessage): string {
  if (email.receivedLabel) return email.receivedLabel
  const date = new Date(email.receivedAt)
  return Number.isNaN(date.getTime())
    ? email.receivedAt
    : new Intl.DateTimeFormat('es-MX', { day: '2-digit', month: 'short' }).format(date)
}

export function EmailTable({ emails, selectedId, onSelect }: EmailTableProps) {
  if (!emails.length) {
    return (
      <div className="inbox-empty">
        <Mail size={26} />
        <strong>No hay correos que coincidan</strong>
        <span>Prueba otra búsqueda o cambia los filtros.</span>
      </div>
    )
  }

  return (
    <div className="inbox-list" role="list" aria-label="Correos">
      <div className="inbox-list-header" aria-hidden="true">
        <span />
        <span>Conversación</span>
        <span>Fecha</span>
      </div>
      {emails.map((email) => (
        <button
          key={email.id}
          type="button"
          role="listitem"
          className={`email-row ${selectedId === email.id ? 'email-row--selected' : ''} ${!email.read ? 'email-row--unread' : ''}`}
          onClick={() => onSelect(email)}
        >
          <span className="email-row-sender">
            <span className="email-avatar" aria-hidden="true">
              {initials(email.fromName)}
            </span>
            <strong title={email.fromName}>{email.fromName}</strong>
          </span>
          <span className="email-row-content">
            <strong title={email.subject}>{email.subject}</strong>
            <span title={email.preview || 'Sin contenido de texto'}>
              {email.preview || 'Sin contenido de texto'}
            </span>
          </span>
          <span className="email-row-meta">
            <time dateTime={email.receivedAt}>{receivedLabel(email)}</time>
            {email.hasAttachments || email.attachments.length > 0 ? (
              <span className="email-row-attachments" aria-label={`Archivos adjuntos: ${email.attachments.length}`}>
                <FileText size={14} />
                {email.attachments.length || ''}
              </span>
            ) : null}
          </span>
        </button>
      ))}
    </div>
  )
}
