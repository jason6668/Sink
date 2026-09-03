import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { z } from 'zod'
import { licenseCodes } from '../../database/schema'

const ActivateSchema = z.object({
  licenseCode: z.string().trim().min(8).max(32),
  deviceId: z.string().trim().min(8).max(256),
  appVersion: z.string().trim().max(32).optional(),
})

export default eventHandler(async (event) => {
  const input = await readValidatedBody(event, ActivateSchema.parse)
  const db = drizzle(event.context.cloudflare.env.DB)
  const normalized = normalizeLicenseCode(input.licenseCode)
  const row = await db.select().from(licenseCodes).where(eq(licenseCodes.code, formatLicenseCode(normalized))).get()
  if (!row || row.status === 'revoked')
    throw createError({ status: 400, statusText: '授权码无效或已撤销' })
  if (row.status === 'activated' && row.deviceId !== deviceHash(input.deviceId))
    throw createError({ status: 409, statusText: '授权码已绑定其他设备' })

  const now = Math.floor(Date.now() / 1000)
  const token = await signLicenseToken(event, { v: 1, code: row.code, device: deviceHash(input.deviceId), type: 'permanent', iat: now })
  await db.update(licenseCodes).set({ status: 'activated', deviceId: deviceHash(input.deviceId), licenseTokenHash: hashLicenseToken(token), activatedAt: row.activatedAt ?? now }).where(eq(licenseCodes.id, row.id)).run()
  return { success: true, type: 'permanent', licenseToken: token }
})
