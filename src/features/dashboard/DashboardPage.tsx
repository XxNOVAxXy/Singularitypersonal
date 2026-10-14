import { Link } from 'react-router-dom'
import { Play, RefreshCw } from 'lucide-react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { StatGrid } from '@/features/dashboard/components/StatGrid'
import { PendingList } from '@/features/dashboard/components/PendingList'
import { ActivityFeed } from '@/features/dashboard/components/ActivityFeed'

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Resumen de correos, documentos y actividad de extracción."
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />}>
              Actualizar
            </Button>
            <Link
              to="/extraccion"
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-brand-600 px-3 text-xs font-medium text-white shadow-sm transition-colors hover:bg-brand-700"
            >
              <Play size={14} />
              Nueva extracción
            </Link>
          </>
        }
      />

      <StatGrid />

      <div className="grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <PendingList />
        </div>
        <div className="xl:col-span-2">
          <ActivityFeed />
        </div>
      </div>
    </div>
  )
}
