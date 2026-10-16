import type { EmailAttachment, EmailMessage } from '../types/index.ts'

export type ImapSecurity = 'ssl' | 'starttls' | 'none'

export interface ImapAccount {
  id: string
  label: string
  email: string
  username: string
  host: string
  port: number
  security: ImapSecurity
  authMethod: 'password'
  status: 'unknown' | 'connected' | 'error'
  lastError?: string | null
  lastChecked?: string | null
  folders: string[]
}

export interface ImapAccountInput {
  label: string
  email: string
  username: string
  password?: string
  host: string
  port: number
  security: ImapSecurity
  authMethod: 'password'
}

export class ImapServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImapServiceError'
  }
}

function resolveImapBaseUrl(): string {
  const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> }
  return (meta.env?.VITE_GMAIL_API_URL ?? '').replace(/\/+$/, '')
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${resolveImapBaseUrl()}${path}`, init)
  } catch {
    throw new ImapServiceError('No se pudo conectar con el servidor IMAP.')
  }

  let payload: unknown = null
  try {
    payload = await response.json()
  } catch {
    // El mensaje genérico evita mostrar detalles del servidor.
  }
  if (!response.ok) {
    const detail = typeof payload === 'object' && payload !== null && 'detail' in payload
      ? (payload as { detail?: unknown }).detail
      : undefined
    throw new ImapServiceError(typeof detail === 'string' ? detail : 'La operación IMAP no pudo completarse.')
  }
  return payload as T
}

export function getImapAccounts(): Promise<{ accounts: ImapAccount[] }> {
  return request('/api/imap/accounts')
}

export function testImapConnection(input: ImapAccountInput, accountId?: string): Promise<{ folders: string[] }> {
  return request('/api/imap/accounts/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(accountId ? { ...input, accountId } : input),
  })
}

export function createImapAccount(input: ImapAccountInput): Promise<{ account: ImapAccount }> {
  return request('/api/imap/accounts', jsonRequest(input))
}

export function updateImapAccount(id: string, input: ImapAccountInput): Promise<{ account: ImapAccount }> {
  return request(`/api/imap/accounts/${encodeURIComponent(id)}`, jsonRequest(input, 'PATCH'))
}

export function retestImapAccount(id: string): Promise<{ account: ImapAccount }> {
  return request(`/api/imap/accounts/${encodeURIComponent(id)}/test`, { method: 'POST' })
}

export function deleteImapAccount(id: string): Promise<{ ok: boolean }> {
  return request(`/api/imap/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function getImapMessages(accountId: string, folder: string): Promise<{ messages: EmailMessage[] }> {
  const params = new URLSearchParams({ account_id: accountId, folder, limit: '50' })
  return request<{ messages: unknown[] }>(`/api/imap/messages?${params.toString()}`).then((payload) => ({
    messages: payload.messages.map((message) => normalizeMessage(message, accountId)),
  }))
}

export function getImapMessage(accountId: string, messageId: string): Promise<EmailMessage> {
  const params = new URLSearchParams({ account_id: accountId })
  return request<unknown>(`/api/imap/messages/${encodeURIComponent(messageId)}?${params.toString()}`).then((message) => normalizeMessage(message, accountId))
}

function jsonRequest(input: ImapAccountInput, method = 'POST'): RequestInit {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }
}

function normalizeMessage(value: unknown, accountId: string): EmailMessage {
  const item = value as Record<string, unknown>
  const attachments = Array.isArray(item.attachments)
    ? item.attachments.map((attachment) => normalizeAttachment(attachment))
    : []
  const unread = item.unread === true
  return {
    id: String(item.id ?? ''),
    fromName: String(item.sender ?? 'Remitente desconocido'),
    fromEmail: String(item.senderEmail ?? ''),
    subject: String(item.subject ?? '(Sin asunto)'),
    preview: String(item.preview ?? ''),
    body: String(item.body ?? ''),
    receivedAt: String(item.receivedAt ?? ''),
    read: !unread,
    attachments,
    source: 'imap',
    mailbox: String(item.folder ?? 'INBOX'),
    bodyHtml: typeof item.bodyHtml === 'string' ? item.bodyHtml : null,
    accountId,
    accountName: typeof item.accountName === 'string' ? item.accountName : undefined,
    labels: Array.isArray(item.labels) ? item.labels.map(String) : undefined,
    hasAttachments: attachments.length > 0,
    receivedLabel: typeof item.receivedLabel === 'string' ? item.receivedLabel : undefined,
    policyType: typeof item.policyType === 'string' ? item.policyType : undefined,
    isPolicyRelated: item.isPolicyRelated === true,
    to: normalizeAddresses(item.to),
    cc: normalizeAddresses(item.cc),
    inlineResources: normalizeInlineResources(item.inlineResources),
  }
}

function normalizeAttachment(value: unknown): EmailAttachment {
  const item = value as Record<string, unknown>
  const mimeType = typeof item.mimeType === 'string' ? item.mimeType : undefined
  const isPdf = item.isPdf === true || mimeType === 'application/pdf'
  const isImage = item.isImage === true || Boolean(mimeType?.startsWith('image/'))
  return {
    id: String(item.id ?? ''),
    name: String(item.name ?? 'adjunto'),
    fileType: isPdf ? 'pdf' : isImage ? 'image' : 'file',
    sizeKb: typeof item.sizeKb === 'number' ? item.sizeKb : 0,
    mimeType,
    isPdf,
    isImage,
    downloadUrl: absoluteUrl(item.downloadUrl),
    previewUrl: absoluteUrl(item.previewUrl),
  }
}

function absoluteUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined
  return value.startsWith('/') ? `${resolveImapBaseUrl()}${value}` : value
}

function normalizeAddresses(value: unknown): Array<{ name: string; email: string }> | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const address = item as { name?: unknown; email?: unknown }
    return typeof address.email === 'string'
      ? [{ name: typeof address.name === 'string' ? address.name : '', email: address.email }]
      : []
  })
}

function normalizeInlineResources(value: unknown): Array<{ contentId: string; attachmentId?: string; mimeType: string; url?: string }> | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const resource = item as { contentId?: unknown; attachmentId?: unknown; mimeType?: unknown; url?: unknown }
    if (typeof resource.contentId !== 'string' || typeof resource.mimeType !== 'string') return []
    return [{
      contentId: resource.contentId,
      attachmentId: typeof resource.attachmentId === 'string' ? resource.attachmentId : undefined,
      mimeType: resource.mimeType,
      url: absoluteUrl(resource.url),
    }]
  })
}
