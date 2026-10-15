import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import type { EmailAddress, EmailAttachment, EmailMessage, ThreadMessage } from '@/types'
import { AttachmentList } from './AttachmentList'

interface EmailDetailProps {
  email: EmailMessage
  loading?: boolean
  onExtract?: (attachment: EmailAttachment) => void
  extractingId?: string | null
  onClose: () => void
}

export function EmailDetail({
  email,
  loading = false,
  onExtract,
  extractingId,
  onClose,
}: EmailDetailProps) {
  const [showHeaders, setShowHeaders] = useState(false)
  const [activePdf, setActivePdf] = useState<EmailAttachment | null>(null)
  const pdfCount = email.attachments.filter((attachment) => attachment.isPdf ?? attachment.fileType === 'pdf').length
  const bodyHtml = email.bodyHtml ? resolveInlineResources(email.bodyHtml, email.inlineResources) : null
  const hasHtmlContent = bodyHtml ? hasVisibleHtmlContent(bodyHtml) : false
  const hasBody = hasHtmlContent || Boolean(email.body?.trim())

  useEffect(() => {
    setActivePdf(null)
    setShowHeaders(false)
  }, [email.id])

  const pdfUrl = activePdf?.previewUrl || activePdf?.downloadUrl

  return (
    <section className="email-reader" aria-label="Detalle del correo">
      <div className="reader-toolbar">
        <button className="reader-back" type="button" onClick={onClose}>
          <span aria-hidden="true">←</span>
          Volver a la bandeja
        </button>
        <div className="reader-toolbar-actions">
          {email.thread && email.thread.length > 1 ? (
            <span className="thread-count">{email.thread.length} mensajes</span>
          ) : null}
          <button className="reader-close" type="button" aria-label="Cerrar detalle" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="reader-loading">
          <span className="loading-orbit" />
          <strong>Cargando correo completo...</strong>
        </div>
      ) : (
        <article className="reader-article">
          <div className="reader-heading">
            <div className="reader-title-row">
              <span className={`mail-read-state ${!email.read ? 'mail-read-state--unread' : ''}`}>
                <i />
                {email.read ? 'Leído' : 'No leído'}
              </span>
              <h2>{email.subject}</h2>
            </div>
            <time dateTime={email.receivedAt}>{formatReaderDate(email.receivedAt)}</time>
          </div>

          <div className="reader-sender">
            <span className="reader-avatar">{initials(email.fromName)}</span>
            <div className="sender-copy">
              <strong>{email.fromName}</strong>
              <span>{email.fromEmail}</span>
              <div className="recipient-line">Para: {formatAddresses(email.to)}</div>
              {email.cc?.length ? <div className="recipient-line">CC: {formatAddresses(email.cc)}</div> : null}
            </div>
            <button className="details-toggle" type="button" onClick={() => setShowHeaders((current) => !current)}>
              {showHeaders ? 'Ocultar detalles' : 'Detalles'}
              {showHeaders ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
          </div>

          {showHeaders ? (
            <div className="reader-headers">
              <div><span>De</span><strong>{email.fromName} &lt;{email.fromEmail}&gt;</strong></div>
              <div><span>Fecha</span><strong>{formatReaderDate(email.receivedAt)}</strong></div>
              <div><span>Asunto</span><strong>{email.subject}</strong></div>
            </div>
          ) : null}

          {hasBody ? (
            <div className="reader-body reader-body--adaptive">
              {hasHtmlContent && bodyHtml ? (
                <AdaptiveEmailFrame html={bodyHtml} title={`Contenido de ${email.subject}`} />
              ) : (
                <p className="email-plain-body">{email.body}</p>
              )}
            </div>
          ) : null}

          {email.attachments.length > 0 ? (
            <div className="reader-attachments">
              <div className="reader-section-heading">
                <h3>Archivos adjuntos</h3>
                <span>{pdfCount ? `${pdfCount} PDF${pdfCount === 1 ? '' : 's'}` : `${email.attachments.length} archivo(s)`}</span>
              </div>
              <AttachmentList
                attachments={email.attachments}
                onExtract={onExtract}
                onViewPdf={setActivePdf}
                extractingId={extractingId}
              />
            </div>
          ) : null}

          {activePdf ? (
            <div className="email-pdf-preview">
              <div className="email-pdf-preview__header">
                <div className="email-pdf-preview__info">
                  <span className="pdf-icon">PDF</span>
                  <div>
                    <strong>{activePdf.name}</strong>
                    <span>{formatAttachmentSize(activePdf)} · Documento PDF</span>
                  </div>
                </div>
                <button type="button" className="email-pdf-preview__close" onClick={() => setActivePdf(null)}>
                  Cerrar PDF
                </button>
              </div>
              {pdfUrl ? (
                <iframe key={pdfUrl} src={pdfUrl} title={`Vista previa de ${activePdf.name}`} className="email-pdf-preview__frame" />
              ) : <p className="pdf-preview-empty">No hay una URL disponible para visualizar este documento.</p>}
            </div>
          ) : null}

          {email.thread && email.thread.length > 1 ? <ThreadHistory messages={email.thread} /> : null}
        </article>
      )}
    </section>
  )
}

function AdaptiveEmailFrame({ html, title }: { html: string; title: string }) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const [height, setHeight] = useState(80)

  useEffect(() => {
    setHeight(80)
    return () => {
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [html])

  const handleLoad = () => {
    const frame = frameRef.current
    if (!frame) return
    observerRef.current?.disconnect()
    try {
      const document = frame.contentDocument
      if (!document) return
      const style = document.createElement('style')
      style.textContent = 'html,body{margin:0!important;padding:0!important;max-width:100%!important;min-height:0!important;height:auto!important;overflow-x:auto!important}img,video{max-width:100%;height:auto}'
      document.head?.appendChild(style)
      const updateHeight = () => {
        const nextHeight = Math.max(32, document.body?.scrollHeight ?? 0, document.documentElement?.scrollHeight ?? 0)
        setHeight((previous) => Math.abs(previous - nextHeight) > 2 ? Math.min(nextHeight, 20000) : previous)
      }
      updateHeight()
      const observer = new ResizeObserver(updateHeight)
      if (document.body) observer.observe(document.body)
      observer.observe(document.documentElement)
      observerRef.current = observer
    } catch {
      setHeight(320)
    }
  }

  return (
    <iframe
      ref={frameRef}
      className="email-html-frame email-html-frame--adaptive"
      title={title}
      sandbox="allow-same-origin"
      srcDoc={html}
      scrolling="auto"
      onLoad={handleLoad}
      style={{ height: `${height}px` }}
    />
  )
}

function ThreadHistory({ messages }: { messages: ThreadMessage[] }) {
  return (
    <div className="conversation-history">
      <div className="reader-section-heading"><h3>Conversación</h3><span>{messages.length} mensajes</span></div>
      {messages.map((message) => {
        const bodyHtml = message.bodyHtml ? resolveInlineResources(message.bodyHtml, message.inlineResources) : null
        return (
          <details className="thread-message" key={message.id}>
            <summary>
              <span className="thread-avatar">{initials(message.fromName)}</span>
              <span><strong>{message.fromName}</strong><small>{formatReaderDate(message.receivedAt)} · {message.subject}</small></span>
              <ChevronDown size={14} />
            </summary>
            <div className="thread-body">
              {bodyHtml && hasVisibleHtmlContent(bodyHtml) ? <AdaptiveEmailFrame html={bodyHtml} title={`Contenido de ${message.subject}`} /> : <p className="email-plain-body">{message.body}</p>}
            </div>
          </details>
        )
      })}
    </div>
  )
}

function initials(name: string): string {
  return name.split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase()
}

function formatAddresses(addresses?: EmailAddress[]): string {
  return addresses?.length ? addresses.map((address) => address.name ? `${address.name} <${address.email}>` : address.email).join(', ') : 'Sin destinatarios'
}

function formatReaderDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatAttachmentSize(attachment: EmailAttachment): string {
  if (attachment.sizeKb < 1024) return `${attachment.sizeKb} KB`
  return `${(attachment.sizeKb / 1024).toFixed(1)} MB`
}

function hasVisibleHtmlContent(html: string): boolean {
  if (/<(?:img|svg|video|canvas)\b/i.test(html)) return true
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(?:style|script|head)\b[^>]*>[\s\S]*?<\/(?:style|script|head)>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;|&#160;|&#x[a-f0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim().length > 0
}

function resolveInlineResources(html: string, resources?: Array<{ contentId: string; url?: string }>): string {
  const resourceMap = new Map((resources ?? []).filter((resource) => resource.url).map((resource) => [resource.contentId.toLowerCase(), resource.url as string]))
  return html.replace(/(src|background)\s*=\s*(["'])cid:([^"']+)\2/gi, (_match, attribute, quote, contentId) => {
    const url = resourceMap.get(contentId.trim().replace(/[<>]/g, '').toLowerCase())
    return url ? `${attribute}=${quote}${url}${quote}` : `${attribute}=${quote}#${quote}`
  })
}
