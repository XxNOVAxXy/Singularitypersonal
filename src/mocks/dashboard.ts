import type { ActivityEntry, DashboardStats } from '@/types'
import { documents } from '@/mocks/documents'
import { emails } from '@/mocks/emails'

export const activity: ActivityEntry[] = [
  {
    id: 'act-1',
    kind: 'extracted',
    title: 'Extracción con Gemini completada',
    description: 'Allianz_GMM_Colectivo.pdf · 14 campos detectados',
    timestamp: '2026-10-13T09:12:00',
  },
  {
    id: 'act-2',
    kind: 'received',
    title: 'Nuevo correo con 2 adjuntos',
    description: 'Laura Domínguez · Póliza de automóvil flota 2026',
    timestamp: '2026-10-13T08:20:00',
  },
  {
    id: 'act-3',
    kind: 'reviewed',
    title: 'Documento marcado como revisado',
    description: 'Vida_MetLife_Ana_Euan.pdf',
    timestamp: '2026-10-12T17:40:00',
  },
  {
    id: 'act-4',
    kind: 'error',
    title: 'Campos faltantes detectados',
    description: 'Danos_Inmueble_HDI.pdf · 3 campos por revisar',
    timestamp: '2026-10-12T12:05:00',
  },
  {
    id: 'act-5',
    kind: 'extracted',
    title: 'Captura manual guardada',
    description: 'Recibo_Prima_GNP_1T.pdf',
    timestamp: '2026-10-11T15:22:00',
  },
]

export function getDashboardStats(): DashboardStats {
  const unreadEmails = emails.filter((email) => !email.read).length
  const pending = documents.filter((document) => document.status === 'pending')
  const reviewed = documents.filter(
    (document) => document.status === 'reviewed',
  )
  return {
    totalEmails: emails.length,
    unreadEmails,
    totalDocuments: documents.length,
    pendingDocuments: pending.length,
    reviewedDocuments: reviewed.length,
    missingFields: 7,
    reviewFields: 4,
  }
}
