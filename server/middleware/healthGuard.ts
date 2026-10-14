import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env.ts'

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

function isLoopback(address: string | undefined): boolean {
  if (!address) return false
  return LOOPBACK_ADDRESSES.has(address) || address.startsWith('::ffff:127.')
}

/**
 * Protección del endpoint de verificación de Gemini:
 * - Deshabilitado fuera de desarrollo local (NODE_ENV=production).
 * - Solo acepta conexiones desde la propia máquina (loopback).
 * - Si HEALTH_CHECK_TOKEN está definido, exige la cabecera `x-health-token`.
 */
export function geminiHealthGuard(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (env.nodeEnv === 'production') {
    res.status(404).json({ ok: false, error: 'not_found' })
    return
  }

  if (!isLoopback(req.socket.remoteAddress)) {
    res.status(403).json({ ok: false, error: 'forbidden' })
    return
  }

  if (env.healthToken) {
    const provided = req.header('x-health-token')
    if (provided !== env.healthToken) {
      res.status(401).json({ ok: false, error: 'unauthorized' })
      return
    }
  }

  next()
}
