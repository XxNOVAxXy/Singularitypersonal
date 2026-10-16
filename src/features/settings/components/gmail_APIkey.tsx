import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, KeyRound, Mail, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import {
  getGmailStatus,
  GmailServiceError,
  startGmailAuth,
} from '@/services/gmailService'
import {
  getGeminiSettings,
  saveGeminiApiKey,
  SettingsServiceError,
} from '@/services/settingsService'
import { ImapAccountsSettings } from '@/features/settings/components/ImapAccountsSettings'

export function GmailApiKeySettings() {
  const [gmailConnected, setGmailConnected] = useState(false)
  const [gmailEmail, setGmailEmail] = useState<string | null>(null)
  const [gmailLoading, setGmailLoading] = useState(true)
  const [gmailError, setGmailError] = useState<string | null>(null)
  const [geminiApiKey, setGeminiApiKey] = useState('')
  const [geminiConfigured, setGeminiConfigured] = useState(false)
  const [geminiLoading, setGeminiLoading] = useState(true)
  const [geminiSaving, setGeminiSaving] = useState(false)
  const [geminiMessage, setGeminiMessage] = useState<string | null>(null)
  const [geminiError, setGeminiError] = useState<string | null>(null)

  useEffect(() => {
    getGmailStatus()
      .then((status) => {
        setGmailConnected(status.connected)
        setGmailEmail(status.email)
      })
      .catch((reason) => {
        setGmailError(
          reason instanceof GmailServiceError
            ? reason.message
            : 'No se pudo consultar el estado de Gmail.',
        )
      })
      .finally(() => setGmailLoading(false))

    getGeminiSettings()
      .then((settings) => setGeminiConfigured(settings.configured))
      .catch((reason) => {
        setGeminiError(
          reason instanceof SettingsServiceError
            ? reason.message
            : 'No se pudo consultar la configuración de Gemini.',
        )
      })
      .finally(() => setGeminiLoading(false))
  }, [])

  const handleGeminiSave = async () => {
    const apiKey = geminiApiKey.trim()
    if (!apiKey) return

    setGeminiSaving(true)
    setGeminiMessage(null)
    setGeminiError(null)
    try {
      await saveGeminiApiKey(apiKey)
      setGeminiConfigured(true)
      setGeminiApiKey('')
      setGeminiMessage('API key guardada correctamente. Se conservará al reiniciar el servidor.')
    } catch (reason) {
      setGeminiError(
        reason instanceof SettingsServiceError
          ? reason.message
          : 'No se pudo guardar la API key de Gemini.',
      )
    } finally {
      setGeminiSaving(false)
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card
        title="Cuenta de Gmail"
        subtitle="Conecta la cuenta que utilizará el módulo de correos."
      >
        <div className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <Mail className="mt-0.5 shrink-0 text-brand-600" size={20} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-800">
              {gmailLoading
                ? 'Consultando conexión...'
                : gmailConnected
                  ? 'Gmail conectado'
                  : 'Gmail no está conectado'}
            </p>
            {gmailEmail ? (
              <p className="mt-1 truncate text-sm text-slate-500">{gmailEmail}</p>
            ) : null}
          </div>
          {gmailConnected ? (
            <CheckCircle2 className="shrink-0 text-emerald-600" size={18} />
          ) : null}
        </div>
        {gmailError ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-rose-600">
            <AlertCircle size={14} />
            {gmailError}
          </p>
        ) : null}
        <Button
          className="mt-4"
          icon={<Mail size={15} />}
          onClick={startGmailAuth}
        >
          {gmailConnected ? 'Cambiar cuenta de Gmail' : 'Conectar Gmail'}
        </Button>
      </Card>

      <Card
        title="API key de Gemini"
        subtitle="La clave se envía al backend y no se guarda en el navegador."
      >
        <label className="block text-sm font-medium text-slate-700" htmlFor="gemini-api-key">
          API key
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <Input
            id="gemini-api-key"
            type="password"
            value={geminiApiKey}
            onChange={(event) => setGeminiApiKey(event.target.value)}
            placeholder={geminiConfigured ? 'API key configurada' : 'Pega tu API key de Gemini'}
            autoComplete="new-password"
            className="sm:flex-1"
          />
          <Button
            icon={geminiSaving ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
            onClick={() => void handleGeminiSave()}
            disabled={geminiSaving || !geminiApiKey.trim()}
          >
            {geminiSaving ? 'Guardando...' : 'Guardar API key'}
          </Button>
        </div>
        {geminiLoading ? (
          <p className="mt-3 text-xs text-slate-500">Consultando configuración...</p>
        ) : geminiConfigured && !geminiMessage ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle2 size={14} />
            Gemini tiene una API key configurada.
          </p>
        ) : null}
        {geminiMessage ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle2 size={14} />
            {geminiMessage}
          </p>
        ) : null}
        {geminiError ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-rose-600">
            <AlertCircle size={14} />
            {geminiError}
          </p>
        ) : null}
      </Card>
      <ImapAccountsSettings />
    </div>
  )
}
