import { useEffect, useMemo, useState } from 'react'
import { Mail, RefreshCw, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { EmailAttachment, EmailMessage } from '@/types'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmailTable } from '@/features/emails/components/EmailTable'
import { EmailDetail } from '@/features/emails/components/EmailDetail'
import {
  extractGmailAttachment,
  getGmailMessage,
  getGmailMessages,
  getGmailStatus,
  GmailServiceError,
  startGmailAuth,
} from '@/services/gmailService'
import './emailInbox.css'

type EmailFilter = 'all' | 'pdf' | 'no-attachments' | 'pending' | 'processed'
type Mailbox = 'inbox' | 'sent'
type ExtractionStatus = NonNullable<EmailAttachment['extractionStatus']>

export function EmailsPage() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [mailbox, setMailbox] = useState<Mailbox>('inbox')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<EmailFilter>('all')
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [extractingId, setExtractingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadMessages = async (nextMailbox: Mailbox = mailbox) => {
    setSyncing(true)
    setError(null)
    try {
      const nextMessages = await getGmailMessages(nextMailbox)
      setMessages(nextMessages)
      setSelectedId((current) => current && nextMessages.some((message) => message.id === current) ? current : nextMessages[0]?.id ?? null)
    } catch (reason) {
      setError(reason instanceof GmailServiceError ? reason.message : 'No fue posible cargar los correos.')
    } finally {
      setSyncing(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    getGmailStatus().then((status) => {
      if (cancelled) return
      setConnected(status.connected)
      if (status.connected) void loadMessages(mailbox)
      else setLoading(false)
    }).catch(() => {
      if (!cancelled) {
        setConnected(false)
        setLoading(false)
        setError('No se pudo conectar con el backend de Gmail.')
      }
    })
    return () => { cancelled = true }
  }, [mailbox])

  const selectedEmail = messages.find((message) => message.id === selectedId) ?? null
  const visibleMessages = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    return messages.filter((message) => {
      const matchesSearch = !normalizedSearch || `${message.fromName} ${message.fromEmail} ${message.subject} ${message.preview}`.toLowerCase().includes(normalizedSearch)
      const hasPdf = message.attachments.some((attachment) => attachment.isPdf ?? attachment.fileType === 'pdf')
      const hasPending = message.attachments.some((attachment) => ['pending', 'processing', 'error'].includes(attachment.extractionStatus ?? 'pending'))
      const hasProcessed = message.attachments.some((attachment) => attachment.extractionStatus === 'extracted')
      const matchesFilter = filter === 'all' || (filter === 'pdf' && hasPdf) || (filter === 'no-attachments' && !message.attachments.length) || (filter === 'pending' && hasPending) || (filter === 'processed' && hasProcessed)
      return matchesSearch && matchesFilter
    })
  }, [filter, messages, search])

  const selectEmail = async (message: EmailMessage) => {
    setSelectedId(message.id)
    if (message.source !== 'gmail') return
    setDetailLoading(true)
    try {
      const detail = await getGmailMessage(message.id)
      setMessages((current) => current.map((item) => item.id === detail.id ? detail : item))
    } catch (reason) {
      setError(reason instanceof GmailServiceError ? reason.message : 'No fue posible cargar el contenido completo.')
    } finally {
      setDetailLoading(false)
    }
  }

  const handleExtract = async (attachment: EmailAttachment) => {
    if (!selectedEmail?.id || !attachment.id || !attachment.isPdf || selectedEmail.source !== 'gmail') return
    setExtractingId(attachment.id)
    setError(null)
    setMessages((current) => updateAttachmentStatus(current, selectedEmail.id, attachment.id, 'processing'))
    try {
      const result = await extractGmailAttachment(selectedEmail.id, attachment.id) as { documentStatus?: ExtractionStatus }
      const status = result.documentStatus ?? 'extracted'
      const updatedEmail = updateAttachmentStatus(messages, selectedEmail.id, attachment.id, status).find((item) => item.id === selectedEmail.id) ?? selectedEmail
      sessionStorage.setItem('singularity.pendingExtraction', JSON.stringify({ email: updatedEmail, attachment: { ...attachment, extractionStatus: status } }))
      sessionStorage.setItem('singularity.extractionResult', JSON.stringify(result))
      setMessages((current) => updateAttachmentStatus(current, selectedEmail.id, attachment.id, status))
      navigate('/extraccion')
    } catch (reason) {
      setMessages((current) => updateAttachmentStatus(current, selectedEmail.id, attachment.id, 'error'))
      setError(reason instanceof GmailServiceError ? reason.message : 'No fue posible extraer el documento.')
    } finally {
      setExtractingId(null)
    }
  }

  const changeMailbox = (nextMailbox: Mailbox) => {
    if (nextMailbox === mailbox) return
    setMailbox(nextMailbox)
    setSelectedId(null)
  }

  return (
    <div className="email-inbox-page">
      <PageHeader title="Correos y documentos" description="Consulta tus mensajes y decide qué documentos enviar a extracción." />

      <div className="inbox-intro-actions">
        {connected ? (
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />} disabled={syncing} onClick={() => void loadMessages()}>
            {syncing ? 'Sincronizando...' : 'Sincronizar nuevos'}
          </Button>
        ) : (
          <Button size="sm" icon={<Mail size={14} />} onClick={startGmailAuth}>Conectar Gmail</Button>
        )}
      </div>

      {!connected ? (
        <div className="integration-banner">
          <Mail size={17} />
          <span>Conecta Gmail para cargar tus mensajes reales.</span>
          <Button variant="ghost" size="sm" onClick={startGmailAuth}>Autorizar cuenta</Button>
        </div>
      ) : null}
      {error ? (
        <div className="integration-banner integration-banner--error">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={() => void loadMessages()}>Reintentar</Button>
        </div>
      ) : null}

      {!connected ? (
        <section className="gmail-connection-empty">
          <Mail size={34} />
          <h2>Gmail no está conectado</h2>
          <p>No se muestran datos de demostración. Autoriza tu cuenta para cargar tus correos reales.</p>
          <Button icon={<Mail size={15} />} onClick={startGmailAuth}>Conectar Gmail</Button>
        </section>
      ) : null}

      {connected ? <>
      <div className="inbox-tabs" role="tablist" aria-label="Bandejas">
        <button type="button" className={mailbox === 'inbox' ? 'inbox-tab inbox-tab--active' : 'inbox-tab'} onClick={() => changeMailbox('inbox')}>
          <Mail size={16} />Recibidos{mailbox === 'inbox' ? <span>{messages.length}</span> : null}
        </button>
        <button type="button" className={mailbox === 'sent' ? 'inbox-tab inbox-tab--active' : 'inbox-tab'} onClick={() => changeMailbox('sent')}>
          <span aria-hidden="true">↗</span>Enviados{mailbox === 'sent' ? <span>{messages.length}</span> : null}
        </button>
      </div>

      <div className="inbox-layout">
        <section className="inbox-panel">
          <div className="inbox-toolbar">
            <div className="inbox-toolbar-heading">
              <strong>{mailbox === 'inbox' ? 'Todos los recibidos' : 'Mensajes enviados'}</strong>
              <span>{loading ? 'Cargando...' : `${visibleMessages.length} visibles`}</span>
            </div>
            <div className="inbox-controls">
              <label className="inbox-search">
                <Search size={14} />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar correo..." type="search" />
              </label>
              <label className="filter-select">
                <span>Filtro</span>
                <select value={filter} onChange={(event) => setFilter(event.target.value as EmailFilter)}>
                  <option value="all">Todos</option>
                  <option value="pdf">Con PDF</option>
                  <option value="no-attachments">Sin adjuntos</option>
                  <option value="pending">Pendientes</option>
                  <option value="processed">Extraídos</option>
                </select>
              </label>
            </div>
          </div>
          <EmailTable emails={visibleMessages} selectedId={selectedId} onSelect={(email) => void selectEmail(email)} />
        </section>

        {selectedEmail ? (
          <EmailDetail email={selectedEmail} loading={detailLoading} onExtract={handleExtract} extractingId={extractingId} onClose={() => setSelectedId(null)} />
        ) : (
          <section className="reader-empty"><EmptyState icon={<Mail size={28} />} title="Selecciona un correo" description="Elige un mensaje de la lista para ver su contenido y adjuntos." /></section>
        )}
      </div>
      </> : null}
    </div>
  )
}

function updateAttachmentStatus(messages: EmailMessage[], messageId: string, attachmentId: string, status: ExtractionStatus): EmailMessage[] {
  return messages.map((message) => message.id !== messageId ? message : {
    ...message,
    attachments: message.attachments.map((attachment) => attachment.id === attachmentId ? { ...attachment, extractionStatus: status } : attachment),
  })
}
