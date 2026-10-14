import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import type { EmailMessage } from '@/types'
import { emails as seedEmails } from '@/mocks/emails'
import { PageHeader } from '@/components/ui/PageHeader'
import { EmptyState } from '@/components/ui/EmptyState'
import { EmailTable } from '@/features/emails/components/EmailTable'
import { EmailDetail } from '@/features/emails/components/EmailDetail'

export function EmailsPage() {
  const [messages, setMessages] = useState<EmailMessage[]>(seedEmails)
  const [selectedId, setSelectedId] = useState<string | null>(
    seedEmails[0]?.id ?? null,
  )
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return messages
    return messages.filter(
      (email) =>
        email.subject.toLowerCase().includes(term) ||
        email.fromName.toLowerCase().includes(term) ||
        email.fromEmail.toLowerCase().includes(term) ||
        email.preview.toLowerCase().includes(term),
    )
  }, [messages, query])

  const selected = messages.find((email) => email.id === selectedId) ?? null

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setMessages((current) =>
      current.map((email) =>
        email.id === id ? { ...email, read: true } : email,
      ),
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bandeja de correos"
        description="Mensajes recibidos y sus documentos adjuntos listos para extraer."
      />

      <div className="relative max-w-md">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          type="search"
          placeholder="Buscar por remitente o asunto…"
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-7">
          <EmailTable
            emails={filtered}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
        </div>
        <div className="xl:col-span-5">
          {selected ? (
            <EmailDetail email={selected} />
          ) : (
            <EmptyState
              title="Selecciona un correo"
              description="Elige un mensaje de la lista para ver su contenido y adjuntos."
            />
          )}
        </div>
      </div>
    </div>
  )
}
