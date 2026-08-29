import type { Link } from '#shared/schemas/link'
import { LinkPasswordSchema, nanoid, SlugSchema } from '#shared/schemas/link'

/**
 * 文件/视频转链接上传接口：POST /api/upload/file
 *
 *  - multipart/form-data：file（必填）、slug/title/password/expiration（可选）
 *  - 生成 UUID 化的 R2 对象 Key：files/{slug}/{nanoid}.{ext}，写入绑定的 R2 Bucket
 *  - 在 D1 links 表创建记录：type=file|video、fileKey 等冗余字段，
 *    url 存自引用短链（重定向中间件会拦截 file/video 类型，不会真的 302）
 *  - 过期时间复用 Link.expiration（unix 秒），密码复用 Link.password（PBKDF2 哈希），
 *    到期由 link-store 的 effectiveExpiresAt 机制自动失效，密码由重定向中间件统一拦截
 */

const FILE_KEY_PREFIX = 'files'

defineRouteMeta({
  openAPI: {
    description: 'Upload a file (or video) to R2 storage and create a short link',
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            required: ['file'],
            properties: {
              file: { type: 'string', format: 'binary' },
              slug: { type: 'string' },
              title: { type: 'string' },
              password: { type: 'string' },
              expiration: { type: 'integer', description: 'Unix seconds, optional' },
            },
          },
        },
      },
    },
  },
})

export default eventHandler(async (event) => {
  const R2 = requireR2Bucket(event.context.cloudflare.env)

  const formData = await readFormData(event)
  const file = formData.get('file') as File | null

  if (!file || file.size === 0) {
    throw createError({ status: 400, statusText: 'File is required' })
  }

  const maxSizeMb = Number(useRuntimeConfig(event).fileUploadMaxSizeMb ?? 100)
  if (Number.isFinite(maxSizeMb) && maxSizeMb > 0 && file.size > maxSizeMb * 1024 * 1024) {
    throw createError({ status: 413, statusText: `File size exceeds ${maxSizeMb}MB limit` })
  }

  // ---- slug：显式传入或自动生成；统一大小写并查重 ----
  const slugInput = (formData.get('slug') as string | null)?.trim() || ''
  const slugCandidate = slugInput || nanoid()()
  const slugResult = SlugSchema.safeParse(slugCandidate)
  if (!slugResult.success) {
    throw createError({ status: 400, statusText: 'Invalid slug format' })
  }
  const slug = normalizeSlug(event, slugResult.data)

  const existing = await getAnyAuthoritativeLink(event, slug)
  if (existing) {
    throw createError({ status: 409, statusText: 'Slug already exists' })
  }

  // ---- 可选字段 ----
  const title = (formData.get('title') as string | null)?.trim().slice(0, 256) || undefined

  const passwordInput = (formData.get('password') as string | null)?.trim() || ''
  let password: string | undefined
  if (passwordInput) {
    const parsedPassword = LinkPasswordSchema.safeParse(passwordInput)
    if (!parsedPassword.success) {
      throw createError({ status: 400, statusText: 'Invalid password' })
    }
    password = parsedPassword.data
  }

  const expirationInput = Number(formData.get('expiration') ?? 0)
  const expiration = Number.isSafeInteger(expirationInput) && expirationInput > Math.floor(Date.now() / 1000)
    ? expirationInput
    : undefined

  // ---- 类型判定与 R2 写入 ----
  const contentType = file.type || 'application/octet-stream'
  const type: 'video' | 'file' = contentType.startsWith('video/') ? 'video' : 'file'

  const rawExt = file.name.includes('.') ? file.name.split('.').pop()! : ''
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)
  const fileKey = `${FILE_KEY_PREFIX}/${slug}/${nanoid(10)()}${ext ? `.${ext}` : ''}`

  await R2.put(fileKey, file, {
    httpMetadata: {
      contentType,
    },
  })

  // ---- 写入 D1 links（url 存自引用短链，重定向中间件按 type 拦截） ----
  const now = Math.floor(Date.now() / 1000)
  const link: Link = {
    id: nanoid(10)(),
    slug,
    url: buildShortLink(event, slug),
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...(title ? { title } : {}),
    ...(expiration ? { expiration } : {}),
    ...(password ? { password: await normalizeLinkPasswordForStorage(password) } : {}),
    type,
    fileKey,
    fileName: file.name.slice(0, 256),
    fileType: contentType.slice(0, 128),
    fileSize: file.size,
  }

  const created = await createLink(event, link)
  if (!created) {
    await R2.delete(fileKey).catch(() => {})
    throw createError({ status: 409, statusText: 'Slug already exists' })
  }

  return {
    slug,
    url: buildShortLink(event, slug),
    type,
    contentType,
    size: file.size,
    fileName: link.fileName,
    expiration: expiration ?? null,
    passwordProtected: Boolean(password),
  }
})
