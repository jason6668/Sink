import { desc } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { licenseCodes } from '../../database/schema'

export default eventHandler(async (event) => {
  await requireLicenseAdmin(event)
  const db = drizzle(event.context.cloudflare.env.DB)
  const rows = await db.select({
    id: licenseCodes.id,
    code: licenseCodes.code,
    status: licenseCodes.status,
    deviceId: licenseCodes.deviceId,
    createdAt: licenseCodes.createdAt,
    activatedAt: licenseCodes.activatedAt,
    revokedAt: licenseCodes.revokedAt,
    note: licenseCodes.note,
  }).from(licenseCodes).orderBy(desc(licenseCodes.createdAt)).limit(500).all()
  return { success: true, codes: rows }
})
