import { timingSafeEqual } from 'node:crypto'

// Machine-to-machine surfaces (MCP clients, n8n, bots) authenticate with
// openApiToken instead of a dashboard session. They still fall back to
// siteToken so an existing deployment keeps working unchanged.
const MACHINE_TOKEN_PREFIXES = ['/api/mcp', '/api/v1/']

export default eventHandler(async (event) => {
  if (!event.path.startsWith('/api/'))
    return

  // Mobile clients must be able to submit a license code before they have a
  // dashboard/site token. The endpoint still validates the code and binds it
  // to the device server-side.
  if (event.path === '/api/license/activate')
    return

  const token = getHeader(event, 'Authorization')?.replace(/^Bearer\s+/, '')
  const { licenseAdminToken } = useRuntimeConfig(event)
  if (
    licenseAdminToken
    && (event.path === '/api/license/generate' || event.path === '/api/license/revoke')
    && await verifySiteToken(token, licenseAdminToken)
  ) {
    return
  }
  if (await verifySiteToken(token, useRuntimeConfig(event).siteToken)) {
    event.context.authMethod = 'site-token'
    event.context.userID = 'root'
    event.context.userEmail = `root@${getRequestURL(event).hostname}`
    return
  }

  const { openApiToken } = useRuntimeConfig(event)
  if (
    openApiToken
    && MACHINE_TOKEN_PREFIXES.some(prefix => event.path.startsWith(prefix))
    && await verifySiteToken(token, openApiToken)
  ) {
    event.context.authMethod = 'open-api-token'
    event.context.userID = 'machine'
    event.context.userEmail = `machine@${getRequestURL(event).hostname}`
    return
  }

  const accessIdentity = await verifyCloudflareAccess(event)
  if (accessIdentity) {
    if (isCloudflareAccessRequestAllowed(event)) {
      Object.assign(
        event.context,
        mapCloudflareAccessIdentity(accessIdentity, getRequestURL(event).hostname),
      )
      return
    }

    throw createError({
      status: 403,
      statusText: 'Forbidden',
    })
  }

  if (token && token.length < 8) {
    throw createError({
      status: 401,
      statusText: 'Token is too short',
    })
  }

  throw createError({
    status: 401,
    statusText: 'Unauthorized',
  })
})

async function verifySiteToken(provided: string | undefined, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided || '')),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash))
}
