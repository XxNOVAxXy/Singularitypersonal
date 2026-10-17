import { Download, Eye, Sparkles } from 'lucide-react'
import type { EmailAttachment } from '@/types'
import { formatFileSize } from '@/lib/format'

const statusLabels: Record<NonNullable<EmailAttachment['extractionStatus']>, string> = {
  pending: 'Pendiente de extracción',
  processing: 'Procesando',
  extracted: 'Extraído correctamente',
  error: 'Error de extracción',
  'not-policy': 'No corresponde a una póliza',
}

interface AttachmentListProps {
  attachments: EmailAttachment[]
  onExtract?: (attachment: EmailAttachment) => void
  onViewPdf?: (attachment: EmailAttachment) => void
  extractingId?: string | null
}

export function AttachmentList({
  attachments,
  onExtract,
  onViewPdf,
  extractingId,
}: AttachmentListProps) {
  if (!attachments.length) {
    return <p className="attachments-empty">Este correo no tiene archivos adjuntos.</p>
  }

  return (
    <div className="attachment-list">
      {attachments.map((attachment) => {
        const isPdf = attachment.isPdf ?? attachment.fileType === 'pdf'
        const status = attachment.extractionStatus
        const terminalStatus = status === 'extracted' || status === 'not-policy'
        const isExtracting = extractingId === attachment.id
        const canViewPdf = isPdf && Boolean(attachment.previewUrl || attachment.downloadUrl) && Boolean(onViewPdf)

        return (
          <article className="attachment-item" key={attachment.id}>
            <span className={`file-type file-type--${attachment.fileType}`}>
              {isPdf ? 'PDF' : attachment.fileType.toUpperCase()}
            </span>
            <div className="attachment-copy">
              <strong title={attachment.name}>{attachment.name}</strong>
              <span>
                {formatFileSize(attachment.sizeKb)} · {attachment.mimeType || attachment.fileType.toUpperCase()}
              </span>
              {isPdf && status ? (
                <small className={`document-status document-status--${status}`}>
                  <i />
                  {isExtracting ? 'Procesando...' : statusLabels[status]}
                </small>
              ) : null}
            </div>
            {attachment.downloadUrl || canViewPdf || (isPdf && onExtract) ? (
              <div className="attachment-actions">
                {canViewPdf ? (
                  <button className="attachment-action" type="button" onClick={() => onViewPdf?.(attachment)}>
                    <Eye size={14} />
                    Ver PDF
                  </button>
                ) : null}
                {attachment.downloadUrl ? (
                  <a className="attachment-action" href={attachment.downloadUrl} download={attachment.name}>
                    <Download size={14} />
                    Descargar
                  </a>
                ) : null}
                {isPdf && onExtract ? (
                  <button
                    className={`attachment-action attachment-action--extract ${terminalStatus ? 'attachment-action--done' : ''}`}
                    type="button"
                    onClick={() => onExtract(attachment)}
                    disabled={isExtracting || status === 'processing' || terminalStatus}
                  >
                    <Sparkles size={13} />
                    {status === 'extracted' ? 'Extraído' : status === 'not-policy' ? 'No es póliza' : 'Extraer información'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </article>
        )
      })}
    </div>
  )
}
