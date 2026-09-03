import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { z } from 'zod'
import { licenseCodes } from '../../database/schema'

defineRouteMeta({ openAPI: { security: [{ bearerAuth: [] }] } })

const Schema = z.object({ code: z.string().trim().min(8).max(32) })

export default eventHandler(async (event) => {
  await requireLicenseAdmin(event)
  const input = await readValidatedBody(event, Schema.parse)
  const db = drizzle(event.context.cloudflare.env.DB)
  const code = formatLicenseCode(normalizeLicenseCode(input.code))
  const result = await db.update(licenseCodes).set({ status: 'revoked', revokedAt: Math.floor(Date.now() / 1000) }).where(eq(licenseCodes.code, code)).run()
  if (!result.meta.changes)
    throw createError({ status: 404, statusText: '授权码不存在' })
  return { success: true, code }
})
