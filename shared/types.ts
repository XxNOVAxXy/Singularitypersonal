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
}

export interface EmailAttachment {
  id: string
  name: string
  fileType: DocumentFileType
  sizeKb: number
  documentId?: string
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
