import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { z } from 'zod'
import { licenseCodes } from '../../database/schema'

defineRouteMeta({ openAPI: { security: [{ bearerAuth: [] }] } })

const Schema = z.object({ count: z.number().int().min(1).max(100).default(1), note: z.string().trim().max(200).optional() })

export default eventHandler(async (event) => {
  const input = await readValidatedBody(event, Schema.parse)
  const db = drizzle(event.context.cloudflare.env.DB)
  const createdAt = Math.floor(Date.now() / 1000)
  const codes: string[] = []
  for (let i = 0; i < input.count; i++) {
    let code = generateLicenseCode()
    while (await db.select({ id: licenseCodes.id }).from(licenseCodes).where(eq(licenseCodes.code, code)).get()) code = generateLicenseCode()
    await db.insert(licenseCodes).values({ code, createdAt, note: input.note ?? null }).run()
    codes.push(code)
  }
  return { success: true, codes }
})
