import type {
  EmailAddress,
  EmailAttachment,
  EmailMessage,
  InlineResource,
  ThreadMessage,
} from '../types/index.ts'

const meta = import.meta as ImportMeta & {
  env?: Record<string, string | undefined>
}
const API_BASE_URL = (meta.env?.VITE_GMAIL_API_URL || '').replace(/\/$/, '')

export class GmailServiceError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'GmailServiceError'
    this.status = status
  }
}

interface GmailStatusResponse {
  connected: boolean
  email: string | null
}

interface GmailAttachmentResponse {
  id: string
  attachmentId?: string
  attachmentKey?: string
  name: string
  type?: string
  mimeType?: string
  size?: string
  isPdf?: boolean
  isImage?: boolean
  isPreviewable?: boolean
  extractionStatus?: EmailAttachment['extractionStatus']
}

interface GmailAddressResponse {
  name: string
  email: string
}

interface GmailInlineResourceResponse {
  contentId: string
  attachmentId?: string
  attachmentKey?: string
  mimeType: string
}

interface GmailThreadMessageResponse {
  id: string
  sender: string
  senderEmail: string
  subject: string
  body: string
  bodyHtml?: string | null
  receivedAt: string
  unread?: boolean
  to?: GmailAddressResponse[]
  cc?: GmailAddressResponse[]
  inlineResources?: GmailInlineResourceResponse[]
}

interface GmailMessageResponse {
  id: string
  sender: string
  senderEmail: string
  subject: string
  body: string
  preview: string
  receivedAt: string
  unread?: boolean
  mailbox?: 'inbox' | 'sent'
  bodyHtml?: string | null
  threadId?: string
  labels?: string[]
  hasAttachments?: boolean
  receivedLabel?: string
  policyType?: string
  isPolicyRelated?: boolean
  to?: GmailAddressResponse[]
  cc?: GmailAddressResponse[]
  inlineResources?: GmailInlineResourceResponse[]
  thread?: GmailThreadMessageResponse[]
  attachments: GmailAttachmentResponse[]
}

export interface GmailDocumentRecord {
  id: string
  filename: string
  status: 'pending' | 'processing' | 'extracted' | 'not-policy' | 'error'
  result?: unknown
  messageId?: string
  attachmentId?: string
  attachmentKey?: string
  createdAt?: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/api${path}`, init)
  } catch {
    throw new GmailServiceError(
      'No se pudo conectar con el servicio de Gmail. Comprueba que el backend esté encendido.',
    )
  }

  if (!response.ok) {
    let message = 'No fue posible comunicarse con el servicio de Gmail.'
    try {
      const payload = (await response.json()) as { detail?: string }
      if (payload.detail) message = payload.detail
    } catch {
      // Mantiene el mensaje genérico cuando el backend no devuelve JSON.
    }
    throw new GmailServiceError(message, response.status)
  }
  return response.json() as Promise<T>
}

export function startGmailAuth(): void {
  window.location.assign(`${API_BASE_URL}/api/auth/google`)
}

export function getGmailStatus(): Promise<GmailStatusResponse> {
  return request<GmailStatusResponse>('/gmail/status')
}

function parseSize(value: string | undefined): number {
  if (!value) return 0
  const amount = Number.parseFloat(value)
  if (!Number.isFinite(amount)) return 0
  return value.toUpperCase().includes('MB') ? Math.round(amount * 1024) : Math.round(amount)
}

function toAttachment(messageId: string, item: GmailAttachmentResponse): EmailAttachment {
  const isPdf = item.isPdf ?? item.type === 'pdf'
  const isImage = item.isImage ?? item.type === 'image'
  const base = `${API_BASE_URL}/api/gmail/attachments/${encodeURIComponent(messageId)}/${encodeURIComponent(item.id)}`
  return {
    id: item.id,
    name: item.name,
    fileType: isPdf ? 'pdf' : isImage ? 'image' : 'xlsx',
    sizeKb: parseSize(item.size),
    mimeType: item.mimeType,
    isPdf,
    isImage,
    extractionStatus: item.extractionStatus,
    downloadUrl: `${base}?download=true`,
    previewUrl: item.isPreviewable === false ? undefined : base,
    extractUrl: isPdf ? `${base}/extract` : undefined,
  }
}

function toAddresses(items: GmailAddressResponse[] | undefined): EmailAddress[] | undefined {
  return items?.map((item) => ({ name: item.name, email: item.email }))
}

function toInlineResources(
  messageId: string,
  items: GmailInlineResourceResponse[] | undefined,
): InlineResource[] | undefined {
  return items?.map((item) => ({
    ...item,
    url: `${API_BASE_URL}/api/gmail/attachments/${encodeURIComponent(messageId)}/${encodeURIComponent(item.attachmentKey ?? item.attachmentId ?? '')}`,
  }))
}

function toThreadMessage(item: GmailThreadMessageResponse): ThreadMessage {
  return {
    id: item.id,
    fromName: item.sender,
    fromEmail: item.senderEmail,
    subject: item.subject,
    body: item.body,
    bodyHtml: item.bodyHtml,
    receivedAt: item.receivedAt,
    unread: item.unread,
    to: toAddresses(item.to),
    cc: toAddresses(item.cc),
    inlineResources: toInlineResources(item.id, item.inlineResources),
  }
}

function toEmailMessage(message: GmailMessageResponse): EmailMessage {
  return {
    id: message.id,
    fromName: message.sender,
    fromEmail: message.senderEmail,
    subject: message.subject,
    preview: message.preview,
    body: message.body,
    receivedAt: message.receivedAt,
    read: !message.unread,
    attachments: message.attachments.map((item) => toAttachment(message.id, item)),
    source: 'gmail',
    mailbox: message.mailbox,
    bodyHtml: message.bodyHtml,
    threadId: message.threadId,
    labels: message.labels,
    hasAttachments: message.hasAttachments,
    receivedLabel: message.receivedLabel,
    policyType: message.policyType,
    isPolicyRelated: message.isPolicyRelated,
    to: toAddresses(message.to),
    cc: toAddresses(message.cc),
    inlineResources: toInlineResources(message.id, message.inlineResources),
    thread: message.thread?.map(toThreadMessage),
  }
}

export async function getGmailMessages(
  mailbox: 'inbox' | 'sent',
  query = '',
): Promise<EmailMessage[]> {
  const params = new URLSearchParams({ mailbox })
  if (query) params.set('query', query)
  const payload = await request<{ messages: GmailMessageResponse[] }>(
    `/gmail/messages?${params.toString()}`,
  )
  return payload.messages.map(toEmailMessage)
}

export async function getGmailMessage(messageId: string): Promise<EmailMessage> {
  const message = await request<GmailMessageResponse>(
    `/gmail/messages/${encodeURIComponent(messageId)}`,
  )
  return toEmailMessage(message)
}

export async function extractGmailAttachment(
  messageId: string,
  attachmentId: string,
): Promise<unknown> {
  return request(
    `/gmail/attachments/${encodeURIComponent(messageId)}/${encodeURIComponent(attachmentId)}/extract`,
    { method: 'POST' },
  )
}

export async function getGmailDocuments(): Promise<GmailDocumentRecord[]> {
  const payload = await request<{ documents: GmailDocumentRecord[] }>('/gmail/documents')
  return payload.documents
}
