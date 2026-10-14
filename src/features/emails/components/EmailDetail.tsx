import { Link } from 'react-router-dom'
import { FileSearch, Paperclip, Reply } from 'lucide-react'
import type { EmailMessage } from '@/types'
import { formatDateTime, formatFileSize } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { FileTypeIcon } from '@/components/domain/FileTypeIcon'

interface EmailDetailProps {
  email: EmailMessage
}

export function EmailDetail({ email }: EmailDetailProps) {
  return (
    <div className="flex h-full flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-800">
          {email.subject}
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          {email.fromName} &lt;{email.fromEmail}&gt;
        </p>
        <p className="text-[11px] text-slate-400">
          {formatDateTime(email.receivedAt)}
        </p>
      </header>

      <div className="flex-1 overflow-auto px-5 py-4">
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
          {email.body}
        </p>

        <div className="mt-6">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Paperclip size={13} />
            Adjuntos ({email.attachments.length})
          </p>
          <ul className="space-y-2">
            {email.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50/60 p-3"
              >
                <FileTypeIcon fileType={attachment.fileType} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">
                    {attachment.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {formatFileSize(attachment.sizeKb)}
                  </p>
                </div>
                {attachment.documentId ? (
                  <Link
                    to={`/extraccion?document=${attachment.documentId}`}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white transition-colors hover:bg-brand-700"
                  >
                    <FileSearch size={14} />
                    Abrir en extracción
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <footer className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
        <Button variant="secondary" size="sm" icon={<Reply size={14} />}>
          Responder
        </Button>
      </footer>
    </div>
  )
}
