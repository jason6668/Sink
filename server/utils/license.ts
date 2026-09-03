import type { H3Event } from 'h3'
import { createHash, randomBytes } from 'node:crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function normalizeLicenseCode(value: string): string {
  const clean = value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  return clean.startsWith('MM') ? clean.slice(2) : clean
}

export function formatLicenseCode(raw: string): string {
  const clean = normalizeLicenseCode(raw)
  return `MM-${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}`
}

export function generateLicenseCode(): string {
  const bytes = randomBytes(12)
  let raw = ''
  for (const byte of bytes)
    raw += ALPHABET[byte % ALPHABET.length]
  return formatLicenseCode(raw)
}

export function hashLicenseToken(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function base64url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export async function signLicenseToken(event: H3Event, payload: Record<string, unknown>): Promise<string> {
  const secret = useRuntimeConfig(event).siteToken
  const body = base64url(JSON.stringify(payload))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  const sig = base64url(String.fromCharCode(...new Uint8Array(signature)))
  return `${body}.${sig}`
}

export function deviceHash(deviceId: string): string {
  return hashLicenseToken(deviceId.trim())
}
