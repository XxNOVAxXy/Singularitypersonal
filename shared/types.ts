export type ExtractionMethod = 'manual' | 'gemini'

export type PolicyType = 'auto' | 'gmm' | 'vida' | 'fianza' | 'danos' | 'recibo'

export type DocumentStatus = 'pending' | 'in_review' | 'reviewed'

export type DocumentFileType = 'pdf' | 'image' | 'xlsx'

export type FieldKind =
  | 'text'
  | 'number'
  | 'currency'
  | 'date'
  | 'select'
  | 'boolean'

export type FieldScope = 'general' | 'specific' | 'additional'

export type FieldSource = 'manual' | 'gemini' | 'user'

export type FieldReviewStatus = 'ok' | 'review' | 'missing'

export interface PolicyDocument {
  id: string
  name: string
  policyType: PolicyType
  insurer: string
  client: string
  policyNumber: string
  fileType: DocumentFileType
  pages: number
  sizeKb: number
  receivedAt: string
  status: DocumentStatus
  emailId?: string
  source?: 'demo' | 'gmail'
  previewUrl?: string
  downloadUrl?: string
  extractionFields?: ExtractionField[]
}

export interface EmailAttachment {
  id: string
  name: string
  fileType: DocumentFileType
  sizeKb: number
  documentId?: string
  mimeType?: string
  downloadUrl?: string
  previewUrl?: string
  extractUrl?: string
  isPdf?: boolean
  isImage?: boolean
  extractionStatus?: 'pending' | 'processing' | 'extracted' | 'not-policy' | 'error'
}

export interface EmailAddress {
  name: string
  email: string
}

export interface InlineResource {
  contentId: string
  attachmentId?: string
  attachmentKey?: string
  mimeType: string
  url?: string
}

export interface ThreadMessage {
  id: string
  fromName: string
  fromEmail: string
  subject: string
  body: string
  bodyHtml?: string | null
  receivedAt: string
  unread?: boolean
  to?: EmailAddress[]
  cc?: EmailAddress[]
  inlineResources?: InlineResource[]
}

export interface EmailMessage {
  id: string
  fromName: string
  fromEmail: string
  subject: string
  preview: string
  body: string
  receivedAt: string
  read: boolean
  attachments: EmailAttachment[]
  source?: 'demo' | 'gmail'
  mailbox?: 'inbox' | 'sent'
  bodyHtml?: string | null
  threadId?: string
  labels?: string[]
  hasAttachments?: boolean
  receivedLabel?: string
  policyType?: string
  isPolicyRelated?: boolean
  to?: EmailAddress[]
  cc?: EmailAddress[]
  inlineResources?: InlineResource[]
  thread?: ThreadMessage[]
}

export interface FieldDefinition {
  id: string
  key: string
  label: string
  kind: FieldKind
  scope: FieldScope
  policyTypes?: PolicyType[]
  options?: string[]
  required: boolean
  enabled: boolean
  placeholder?: string
}

export interface ExtractionField {
  key: string
  label: string
  kind: FieldKind
  scope: FieldScope
  value: string
  source: FieldSource
  status: FieldReviewStatus
  required: boolean
  options?: string[]
  confidence?: number
  note?: string
  page?: number
  sourceRef?: string
  reason?: 'not_found' | 'ambiguous' | 'invalid_format' | 'low_confidence' | 'missing_required' | 'user_edited'
}

export interface ExtractionSnapshot {
  id: string
  documentId: string
  method: ExtractionMethod
  label: string
  analyst: string
  createdAt: string
  fields: ExtractionField[]
}

export interface ActivityEntry {
  id: string
  kind: 'received' | 'extracted' | 'reviewed' | 'error'
  title: string
  description: string
  timestamp: string
}

export interface DashboardStats {
  totalEmails: number
  unreadEmails: number
  totalDocuments: number
  pendingDocuments: number
  reviewedDocuments: number
  missingFields: number
  reviewFields: number
}

export interface PolicyTypeConfig {
  id: PolicyType
  label: string
  description: string
}
