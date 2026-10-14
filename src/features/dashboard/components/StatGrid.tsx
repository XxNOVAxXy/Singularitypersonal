import {
  AlertTriangle,
  CheckCircle2,
  FileClock,
  Mail,
} from 'lucide-react'
import { StatCard } from '@/components/ui/StatCard'
import { getDashboardStats } from '@/mocks/dashboard'

export function StatGrid() {
  const stats = getDashboardStats()
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Correos recibidos"
        value={stats.totalEmails}
        hint={`${stats.unreadEmails} sin leer`}
        icon={<Mail size={18} />}
        tone="sky"
      />
      <StatCard
        label="Pólizas por procesar"
        value={stats.pendingDocuments}
        hint={`${stats.totalDocuments} documentos totales`}
        icon={<FileClock size={18} />}
        tone="amber"
      />
      <StatCard
        label="Documentos revisados"
        value={stats.reviewedDocuments}
        hint="Validados por analistas"
        icon={<CheckCircle2 size={18} />}
        tone="emerald"
      />
      <StatCard
        label="Campos por revisar"
        value={stats.missingFields + stats.reviewFields}
        hint={`${stats.missingFields} faltantes · ${stats.reviewFields} por validar`}
        icon={<AlertTriangle size={18} />}
        tone="brand"
      />
    </div>
  )
}
