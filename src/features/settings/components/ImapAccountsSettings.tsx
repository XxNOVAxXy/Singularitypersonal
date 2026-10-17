import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Edit3, Loader2, MailPlus, RefreshCw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import {
  createImapAccount,
  deleteImapAccount,
  getImapAccounts,
  ImapServiceError,
  type ImapAccount,
  type ImapAccountInput,
  retestImapAccount,
  testImapConnection,
  updateImapAccount,
} from '@/services/imapService'

const emptyForm: ImapAccountInput = {
  label: '',
  email: '',
  username: '',
  password: '',
  host: '',
  port: 993,
  security: 'ssl',
  authMethod: 'password',
}

export function ImapAccountsSettings() {
  const [accounts, setAccounts] = useState<ImapAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [form, setForm] = useState<ImapAccountInput>(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null)
  const [formMessage, setFormMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const loadAccounts = async () => {
    setLoading(true)
    setListError(null)
    try {
      const result = await getImapAccounts()
      setAccounts(result.accounts)
    } catch (reason) {
      setListError(reason instanceof ImapServiceError ? reason.message : 'No se pudieron cargar las cuentas IMAP.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadAccounts()
  }, [])

  const openCreate = () => {
    setEditingId(null)
    setForm({ ...emptyForm })
    setFormMessage(null)
    setFormError(null)
    setModalOpen(true)
  }

  const openEdit = (account: ImapAccount) => {
    setEditingId(account.id)
    setForm({
      label: account.label,
      email: account.email,
      username: account.username,
      password: '',
      host: account.host,
      port: account.port,
      security: account.security,
      authMethod: account.authMethod,
    })
    setFormMessage(null)
    setFormError(null)
    setModalOpen(true)
  }

  const closeModal = () => {
    if (testing || saving) return
    setModalOpen(false)
  }

  const updateField = <K extends keyof ImapAccountInput>(field: K, value: ImapAccountInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const updateSecurity = (security: ImapAccountInput['security']) => {
    const port = security === 'ssl' && (form.port === 143 || form.port === 0) ? 993 : security !== 'ssl' && form.port === 993 ? 143 : form.port
    setForm((current) => ({ ...current, security, port }))
  }

  const handleTest = async () => {
    setTesting(true)
    setFormMessage(null)
    setFormError(null)
    try {
      const result = await testImapConnection(form, editingId ?? undefined)
      setFormMessage(`Conexión correcta. ${result.folders.length} carpeta(s) disponible(s).`)
    } catch (reason) {
      setFormError(reason instanceof ImapServiceError ? reason.message : 'No se pudo probar la conexión IMAP.')
    } finally {
      setTesting(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setFormMessage(null)
    setFormError(null)
    try {
      const result = editingId
        ? await updateImapAccount(editingId, form)
        : await createImapAccount(form)
      setAccounts((current) => editingId
        ? current.map((account) => account.id === editingId ? result.account : account)
        : [...current, result.account])
      setModalOpen(false)
    } catch (reason) {
      setFormError(reason instanceof ImapServiceError ? reason.message : 'No se pudo guardar la cuenta IMAP.')
    } finally {
      setSaving(false)
    }
  }

  const handleRetest = async (accountId: string) => {
    setBusyAccountId(accountId)
    try {
      const result = await retestImapAccount(accountId)
      setAccounts((current) => current.map((account) => account.id === accountId ? result.account : account))
    } catch (reason) {
      const message = reason instanceof ImapServiceError ? reason.message : 'No se pudo probar la cuenta IMAP.'
      setAccounts((current) => current.map((account) => account.id === accountId ? { ...account, status: 'error', lastError: message } : account))
    } finally {
      setBusyAccountId(null)
    }
  }

  const handleDelete = async (account: ImapAccount) => {
    if (!window.confirm(`¿Desconectar la cuenta ${account.email}?`)) return
    setBusyAccountId(account.id)
    try {
      await deleteImapAccount(account.id)
      setAccounts((current) => current.filter((item) => item.id !== account.id))
    } catch (reason) {
      setListError(reason instanceof ImapServiceError ? reason.message : 'No se pudo desconectar la cuenta IMAP.')
    } finally {
      setBusyAccountId(null)
    }
  }

  return (
    <Card
      className="xl:col-span-2"
      title="Correos empresariales"
      subtitle="Conecta una o varias cuentas mediante IMAP para consultar sus bandejas reales."
      action={(
        <Button size="sm" icon={<MailPlus size={14} />} onClick={openCreate}>
          Agregar cuenta
        </Button>
      )}
    >
      {listError ? (
        <p className="mb-4 flex items-center gap-2 text-xs text-rose-600">
          <AlertCircle size={14} />
          {listError}
        </p>
      ) : null}
      {loading ? (
        <p className="flex items-center gap-2 py-3 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" /> Cargando cuentas...</p>
      ) : accounts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center">
          <MailPlus className="mx-auto text-slate-400" size={22} />
          <p className="mt-2 text-sm font-medium text-slate-700">No hay cuentas empresariales conectadas</p>
          <p className="mt-1 text-xs text-slate-500">Agrega una cuenta IMAP para recibir sus mensajes en Correos.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {accounts.map((account) => {
            const busy = busyAccountId === account.id
            return (
              <article key={account.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-800">{account.label}</h3>
                    <p className="mt-1 truncate text-xs text-slate-500">{account.email}</p>
                  </div>
                  <StatusBadge account={account} />
                </div>
                <p className="mt-3 truncate text-xs text-slate-500">{account.host}:{account.port} · {account.security === 'ssl' ? 'SSL/TLS' : account.security === 'starttls' ? 'STARTTLS' : 'Sin cifrado local'}</p>
                {account.lastError ? <p className="mt-2 text-xs text-rose-600">{account.lastError}</p> : null}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" icon={busy ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} disabled={busy} onClick={() => void handleRetest(account.id)}>
                    Probar conexión
                  </Button>
                  <Button variant="ghost" size="sm" icon={<Edit3 size={13} />} disabled={busy} onClick={() => openEdit(account)}>
                    Editar
                  </Button>
                  <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} disabled={busy} onClick={() => void handleDelete(account)}>
                    Desconectar
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal() }}>
          <form className="max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl" role="dialog" aria-modal="true" aria-labelledby="imap-form-title" onSubmit={(event) => { event.preventDefault(); void handleSave() }}>
            <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 id="imap-form-title" className="text-sm font-semibold text-slate-800">{editingId ? 'Editar cuenta empresarial' : 'Agregar cuenta empresarial'}</h2>
                <p className="mt-0.5 text-xs text-slate-500">La contraseña se cifra y permanece únicamente en el servidor.</p>
              </div>
              <button type="button" aria-label="Cerrar formulario" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={closeModal}><X size={17} /></button>
            </header>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <Field label="Nombre identificador" required>
                <Input value={form.label} onChange={(event) => updateField('label', event.target.value)} placeholder="Ventas" required maxLength={100} />
              </Field>
              <Field label="Correo empresarial" required>
                <Input type="email" value={form.email} onChange={(event) => updateField('email', event.target.value)} placeholder="ventas@empresa.test" required />
              </Field>
              <Field label="Usuario IMAP" required>
                <Input value={form.username} onChange={(event) => updateField('username', event.target.value)} placeholder="ventas@empresa.test" required />
              </Field>
              <Field label={editingId ? 'Contraseña nueva (opcional)' : 'Contraseña o contraseña de aplicación'} required={!editingId}>
                <Input type="password" value={form.password ?? ''} onChange={(event) => updateField('password', event.target.value)} placeholder={editingId ? 'Dejar vacío para conservarla' : 'Contraseña'} required={!editingId} autoComplete="new-password" />
              </Field>
              <Field label="Servidor IMAP" required>
                <Input value={form.host} onChange={(event) => updateField('host', event.target.value)} placeholder="imap.empresa.com" required />
              </Field>
              <Field label="Puerto" required>
                <Input type="number" min={1} max={65535} value={form.port} onChange={(event) => updateField('port', Number(event.target.value))} required />
              </Field>
              <Field label="Seguridad" required>
                <Select value={form.security} onChange={(event) => updateSecurity(event.target.value as ImapAccountInput['security'])}>
                  <option value="ssl">SSL/TLS</option>
                  <option value="starttls">STARTTLS</option>
                  <option value="none">Sin cifrado (solo pruebas locales)</option>
                </Select>
              </Field>
              <Field label="Autenticación">
                <Select value="password" disabled>
                  <option value="password">Contraseña / app password</option>
                  <option value="oauth">OAuth (próximamente)</option>
                </Select>
              </Field>
            </div>
            {formMessage ? <p className="mx-5 mb-3 flex items-center gap-2 text-xs text-emerald-700"><CheckCircle2 size={14} />{formMessage}</p> : null}
            {formError ? <p className="mx-5 mb-3 flex items-center gap-2 text-xs text-rose-600"><AlertCircle size={14} />{formError}</p> : null}
            <footer className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="ghost" disabled={testing || saving} onClick={closeModal}>Cancelar</Button>
              <Button type="button" variant="secondary" icon={testing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} disabled={testing || saving} onClick={() => void handleTest()}>{testing ? 'Probando...' : 'Probar conexión'}</Button>
              <Button type="submit" disabled={testing || saving}>{saving ? 'Guardando...' : 'Guardar y conectar'}</Button>
            </footer>
          </form>
        </div>
      ) : null}
    </Card>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}{required ? ' *' : ''}
      <span className="mt-1.5 block">{children}</span>
    </label>
  )
}

function StatusBadge({ account }: { account: ImapAccount }) {
  const connected = account.status === 'connected'
  return (
    <span className={connected ? 'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-medium text-emerald-700' : account.status === 'error' ? 'inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700' : 'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium text-slate-600'}>
      {connected ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
      {connected ? 'Conectada' : account.status === 'error' ? 'Error' : 'Sin comprobar'}
    </span>
  )
}
