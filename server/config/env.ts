import dotenv from 'dotenv'

dotenv.config({ quiet: true })

export type NodeEnv = 'development' | 'test' | 'production'

export interface ServerEnv {
  port: number
  host: string
  nodeEnv: NodeEnv
  geminiApiKey: string | undefined
  geminiModel: string
  geminiFallbackModels: string[]
  healthToken: string | undefined
}

const DEFAULT_PORT = 8787
const DEFAULT_HOST = '127.0.0.1'
const DEFAULT_MODEL = 'gemini-3.8-flash'

export class ConfigurationError extends Error {
  readonly code = 'configuration_error'

  constructor(message: string) {
    super(message)
    this.name = 'ConfigurationError'
  }
}

function parsePort(value: string | undefined): number {
  if (!value || value.trim().length === 0) return DEFAULT_PORT
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new ConfigurationError(
      'PORT debe ser un número entero entre 1 y 65535.',
    )
  }
  return parsed
}

function parseNodeEnv(value: string | undefined): NodeEnv {
  if (value === 'production' || value === 'test') return value
  return 'development'
}

function parseModelList(value: string | undefined, primary: string): string[] {
  return [...new Set(
    (value ?? '')
      .split(',')
      .map((model) => model.trim())
      .filter((model) => model.length > 0 && model !== primary),
  )]
}

function readEnv(): ServerEnv {
  const geminiModel = process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL
  return {
    port: parsePort(process.env.PORT),
    host: process.env.HOST?.trim() || DEFAULT_HOST,
    nodeEnv: parseNodeEnv(process.env.NODE_ENV),
    geminiApiKey: process.env.GEMINI_API_KEY?.trim() || undefined,
    geminiModel,
    geminiFallbackModels: parseModelList(
      process.env.GEMINI_FALLBACK_MODELS,
      geminiModel,
    ),
    healthToken: process.env.HEALTH_CHECK_TOKEN?.trim() || undefined,
  }
}

export const env: ServerEnv = readEnv()

/**
 * Devuelve la API key de Gemini o lanza un error de configuración claro.
 * Nunca revela el valor de la clave.
 */
export function requireGeminiApiKey(): string {
  if (!env.geminiApiKey) {
    throw new ConfigurationError(
      'Falta GEMINI_API_KEY. Defínela en el archivo .env del backend ' +
        '(copia .env.example a .env y completa el valor).',
    )
  }
  return env.geminiApiKey
}
