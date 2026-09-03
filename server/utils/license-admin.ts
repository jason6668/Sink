import type { H3Event } from 'h3'
import { timingSafeEqual } from 'node:crypto'

export async function requireLicenseAdmin(event: H3Event): Promise<void> {
  // The existing dashboard authentication is the administrator authentication.
  // Keep the separate secret available for CLI automation, but do not force the
  // browser to expose it or ask the owner to manage a second login.
  if (event.context.authMethod === 'site-token' || event.context.authMethod === 'access-user' || event.context.authMethod === 'access-service')
    return

  const expected = useRuntimeConfig(event).licenseAdminToken
  if (!expected)
    throw createError({ status: 503, statusText: 'License admin token is not configured' })
  const provided = getHeader(event, 'Authorization')?.replace(/^Bearer\s+/, '') || ''
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(provided)),
    crypto.subtle.digest('SHA-256', new TextEncoder().encode(expected)),
  ])
  if (!timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash)))
    throw createError({ status: 401, statusText: 'Unauthorized' })
}
