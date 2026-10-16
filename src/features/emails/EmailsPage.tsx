import { useEffect, useMemo, useRef, useState } from 'react'
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
} from '@/services/gmailService'
import {
  getImapAccounts,
  getImapMessage,
  getImapMessages,
  ImapServiceError,
  type ImapAccount,
} from '@/services/imapService'
import './emailInbox.css'

type EmailFilter = 'all' | 'pdf' | 'no-attachments' | 'pending' | 'processed'
type GmailMailbox = 'inbox' | 'sent'
type ExtractionStatus = NonNullable<EmailAttachment['extractionStatus']>

export function EmailsPage() {
  const navigate = useNavigate()
  const [messages, setMessages] = useState<EmailMessage[]>([])
  const [gmailMailbox, setGmailMailbox] = useState<GmailMailbox>('inbox')
  const [imapFolder, setImapFolder] = useState('INBOX')
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)
  const [imapAccounts, setImapAccounts] = useState<ImapAccount[]>([])
  const [gmailConnected, setGmailConnected] = useState(false)
  const [connectedEmail, setConnectedEmail] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<EmailFilter>('all')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const [extractingId, setExtractingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const requestVersion = useRef(0)

  const activeImapAccount = imapAccounts.find((account) => account.id === selectedAccountId) ?? null
  const hasAccounts = gmailConnected || imapAccounts.length > 0
  const activeFolder = selectedAccountId === 'gmail' ? gmailMailbox : imapFolder
  const activeAccountLabel = selectedAccountId === 'gmail'
    ? connectedEmail ?? 'Gmail'
    : activeImapAccount?.email ?? activeImapAccount?.label ?? 'Correo empresarial'

  const loadMessages = async (accountId = selectedAccountId, folder = activeFolder) => {
    if (!accountId) return
    const version = ++requestVersion.current
    setSyncing(true)
    setError(null)
    try {
      const nextMessages = accountId === 'gmail'
        ? await getGmailMessages(folder as GmailMailbox)
        : (await getImapMessages(accountId, folder)).messages
      if (version !== requestVersion.current) return
      setMessages(nextMessages)
      setSelectedId((current) => current && nextMessages.some((message) => message.id === current)
        ? current
        : nextMessages[0]?.id ?? null)
    } catch (reason) {
      if (version !== requestVersion.current) return
      setError(
        reason instanceof GmailServiceError || reason instanceof ImapServiceError
          ? reason.message
          : 'No fue posible cargar los correos.',
      )
      setMessages([])
      setSelectedId(null)
    } finally {
      setSyncing(false)
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    const loadAccounts = async () => {
      const [gmailResult, imapResult] = await Promise.allSettled([getGmailStatus(), getImapAccounts()])
      if (cancelled) return
      const gmail = gmailResult.status === 'fulfilled' ? gmailResult.value : null
      const imap = imapResult.status === 'fulfilled' ? imapResult.value.accounts : []
      setGmailConnected(Boolean(gmail?.connected))
      setConnectedEmail(gmail?.email ?? null)
      setImapAccounts(imap)
      setSelectedAccountId((current) => current ?? (gmail?.connected ? 'gmail' : imap[0]?.id ?? null))
      if (!gmail?.connected && imapResult.status === 'rejected' && gmailResult.status === 'rejected') {
        setError('No se pudo conectar con los servicios de correo.')
      }
      if (imap[0] && !gmail?.connected) {
        setImapFolder(imap[0].folders[0] ?? 'INBOX')
      }
      if (!gmail?.connected && !imap.length) setLoading(false)
    }
    void loadAccounts()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (selectedAccountId) void loadMessages(selectedAccountId, selectedAccountId === 'gmail' ? gmailMailbox : imapFolder)
  }, [selectedAccountId, gmailMailbox, imapFolder])

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
    if (message.source !== 'gmail' && message.source !== 'imap') return
    setDetailLoading(true)
    try {
      const detail = message.source === 'gmail'
        ? await getGmailMessage(message.id)
        : await getImapMessage(message.accountId ?? selectedAccountId ?? '', message.id)
      setMessages((current) => current.map((item) => item.id === detail.id ? detail : item))
    } catch (reason) {
      setError(
        reason instanceof GmailServiceError || reason instanceof ImapServiceError
          ? reason.message
          : 'No fue posible cargar el contenido completo.',
      )
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

  const selectAccount = (accountId: string) => {
    setSelectedAccountId(accountId)
    setSelectedId(null)
    if (accountId === 'gmail') {
      setGmailMailbox('inbox')
    } else {
      const account = imapAccounts.find((item) => item.id === accountId)
      setImapFolder(account?.folders[0] ?? 'INBOX')
    }
  }

  return (
    <div className="email-inbox-page">
      <PageHeader title="Correos y documentos" description="Consulta tus mensajes y decide qué documentos enviar a extracción." />

      <div className="inbox-intro-actions">
        {hasAccounts && selectedAccountId ? (
          <>
            <span className="text-xs text-slate-500">Cuenta: {activeAccountLabel}</span>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />} disabled={syncing} onClick={() => void loadMessages()}>
              {syncing ? 'Sincronizando...' : 'Actualizar'}
            </Button>
          </>
        ) : (
          <span className="text-xs text-slate-500">Conecta una cuenta desde Configuración.</span>
        )}
      </div>

      {!hasAccounts ? (
        <div className="integration-banner">
          <Mail size={17} />
          <span>Conecta Gmail o una cuenta empresarial para cargar mensajes reales.</span>
          <Button variant="ghost" size="sm" onClick={() => navigate('/configuracion')}>Ir a configuración</Button>
        </div>
      ) : null}
      {error ? (
        <div className="integration-banner integration-banner--error">
          <span>{error}</span>
          {selectedAccountId ? <Button variant="ghost" size="sm" onClick={() => void loadMessages()}>Reintentar</Button> : null}
        </div>
      ) : null}

      {!hasAccounts ? (
        <section className="gmail-connection-empty">
          <Mail size={34} />
          <h2>No hay cuentas de correo conectadas</h2>
          <p>Conecta Gmail o agrega una cuenta empresarial IMAP para cargar sus mensajes reales.</p>
          <Button icon={<Mail size={15} />} onClick={() => navigate('/configuracion')}>Ir a configuración</Button>
        </section>
      ) : null}

      {hasAccounts && selectedAccountId ? <>
        <div className="inbox-source-selector">
          <label className="filter-select">
            <span>Cuenta</span>
            <select value={selectedAccountId} onChange={(event) => selectAccount(event.target.value)}>
              {gmailConnected ? <option value="gmail">Gmail{connectedEmail ? ` · ${connectedEmail}` : ''}</option> : null}
              {imapAccounts.map((account) => <option key={account.id} value={account.id}>{account.label} · {account.email}</option>)}
            </select>
          </label>
        </div>
        <div className="inbox-tabs" role="tablist" aria-label="Bandejas">
          {selectedAccountId === 'gmail' ? (
            <>
              <button type="button" className={gmailMailbox === 'inbox' ? 'inbox-tab inbox-tab--active' : 'inbox-tab'} onClick={() => { setGmailMailbox('inbox'); setSelectedId(null) }}><Mail size={16} />Recibidos{gmailMailbox === 'inbox' ? <span>{messages.length}</span> : null}</button>
              <button type="button" className={gmailMailbox === 'sent' ? 'inbox-tab inbox-tab--active' : 'inbox-tab'} onClick={() => { setGmailMailbox('sent'); setSelectedId(null) }}><span aria-hidden="true">↗</span>Enviados{gmailMailbox === 'sent' ? <span>{messages.length}</span> : null}</button>
            </>
          ) : (activeImapAccount?.folders ?? ['INBOX']).map((folder) => (
            <button key={folder} type="button" className={imapFolder === folder ? 'inbox-tab inbox-tab--active' : 'inbox-tab'} onClick={() => { setImapFolder(folder); setSelectedId(null) }}><Mail size={16} />{folder}{imapFolder === folder ? <span>{messages.length}</span> : null}</button>
          ))}
        </div>

        <div className="inbox-layout">
          <section className="inbox-panel">
            <div className="inbox-toolbar">
              <div className="inbox-toolbar-heading">
                <strong>{selectedAccountId === 'gmail' ? (gmailMailbox === 'inbox' ? 'Todos los recibidos' : 'Mensajes enviados') : `Mensajes de ${imapFolder}`}</strong>
                <span>{loading ? 'Cargando...' : `${visibleMessages.length} visibles`}</span>
              </div>
              <div className="inbox-controls">
                <label className="inbox-search"><Search size={14} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar correo..." type="search" /></label>
                <label className="filter-select"><span>Filtro</span><select value={filter} onChange={(event) => setFilter(event.target.value as EmailFilter)}><option value="all">Todos</option><option value="pdf">Con PDF</option><option value="no-attachments">Sin adjuntos</option><option value="pending">Pendientes</option><option value="processed">Extraídos</option></select></label>
              </div>
            </div>
            <EmailTable emails={visibleMessages} selectedId={selectedId} onSelect={(email) => void selectEmail(email)} />
          </section>

          {selectedEmail ? <EmailDetail email={selectedEmail} loading={detailLoading} onExtract={selectedEmail.source === 'gmail' ? handleExtract : undefined} extractingId={extractingId} onClose={() => setSelectedId(null)} /> : <section className="reader-empty"><EmptyState icon={<Mail size={28} />} title="Selecciona un correo" description="Elige un mensaje de la lista para ver su contenido y adjuntos." /></section>}
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
