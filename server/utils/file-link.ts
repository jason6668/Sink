import type { H3Event } from 'h3'
import type { Link } from '#shared/schemas/link'

/**
 * 文件/视频链接的底层服务：
 *  - 短期访问令牌（HMAC）：用于受密码保护的 <video src> / 直链下载，
 *    替代无法携带密码的二次请求（签名密钥复用 runtimeConfig.siteToken）。
 *  - R2 流式响应（支持 Range，视频拖动进度条必需）。
 *
 * 所有函数经由 Nitro server/utils 自动导入，无需手动 import。
 */

const DEFAULT_TOKEN_TTL_SECONDS = 600

const textEncoder = new TextEncoder()

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), char => char.charCodeAt(0))
}

async function getSigningKey(event: H3Event): Promise<CryptoKey> {
  const secret = useRuntimeConfig(event).siteToken || 'sink-file-token-secret'
  return await crypto.subtle.importKey(
    'raw',
    toArrayBuffer(textEncoder.encode(secret)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/**
 * 为受密码保护的文件/视频签发短期访问令牌：`{exp}.{hmac}`。
 * 在密码验证通过后拼到 /_file/{slug}?sig=... 上，10 分钟内可免密取流。
 */
export async function signFileToken(event: H3Event, slug: string, ttlSeconds = DEFAULT_TOKEN_TTL_SECONDS): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const signature = await crypto.subtle.sign(
    'HMAC',
    await getSigningKey(event),
    toArrayBuffer(textEncoder.encode(`${slug}:${exp}`)),
  )
  return `${exp}.${bytesToBase64Url(new Uint8Array(signature))}`
}

export async function verifyFileToken(event: H3Event, token: string, slug: string): Promise<boolean> {
  const [expValue, signatureValue] = token.split('.')
  if (!expValue || !signatureValue)
    return false

  const exp = Number(expValue)
  if (!Number.isSafeInteger(exp) || exp < Math.floor(Date.now() / 1000))
    return false

  return await crypto.subtle.verify(
    'HMAC',
    await getSigningKey(event),
    toArrayBuffer(base64UrlToBytes(signatureValue)),
    toArrayBuffer(textEncoder.encode(`${slug}:${exp}`)),
  )
}

interface RangeMatch {
  r2Range?: R2Range
  start: number
  end: number
  status: 200 | 206
}

function resolveRange(rangeHeader: string | undefined, size: number): RangeMatch | 'invalid' {
  if (!rangeHeader)
    return { start: 0, end: size - 1, status: 200 }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (!match || (match[1] === '' && match[2] === ''))
    return { start: 0, end: size - 1, status: 200 }

  const [, startValue, endValue] = match

  // 后缀区间 bytes=-N：取最后 N 字节
  if (startValue === '') {
    const suffixLength = Math.min(Number(endValue), size)
    if (suffixLength <= 0)
      return 'invalid'
    return {
      r2Range: { suffix: suffixLength },
      start: size - suffixLength,
      end: size - 1,
      status: 206,
    }
  }

  const start = Number(startValue)
  if (!Number.isSafeInteger(start) || start >= size)
    return 'invalid'

  const end = endValue === '' ? size - 1 : Math.min(Number(endValue), size - 1)
  if (start > end)
    return 'invalid'

  return {
    r2Range: endValue === '' ? { offset: start } : { offset: start, length: end - start + 1 },
    start,
    end,
    status: 206,
  }
}

function encodeContentDisposition(disposition: 'inline' | 'attachment', fileName: string): string {
  const asciiFallback = fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_')
  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

/**
 * 将 Link 对应的 R2 对象以流式响应返回。
 *  - video 类型：inline（配合 /_file/{slug} 播放页或直接访问）
 *  - file 类型：attachment（浏览器直接下载）
 *  - 支持 Range（需要先 head() 拿到 size 以校验/换算区间）
 *  - 带 password 的链接：no-store，避免共享缓存泄漏
 */
export async function streamFileFromR2(event: H3Event, link: Link, options: { forceDownload?: boolean } = {}): Promise<Response> {
  const R2 = requireR2Bucket(event.context.cloudflare.env)
  const fileKey = link.fileKey

  if (!fileKey) {
    throw createError({ status: 404, statusText: 'File not found' })
  }

  const rangeHeader = getHeader(event, 'range')
  let size: number | undefined
  if (rangeHeader) {
    const head = await R2.head(fileKey)
    if (!head) {
      throw createError({ status: 404, statusText: 'File not found' })
    }
    size = head.size
  }

  let object: R2ObjectBody | null
  try {
    if (size !== undefined) {
      const resolved = resolveRange(rangeHeader, size)
      if (resolved === 'invalid') {
        throw createError({
          status: 416,
          statusText: 'Range Not Satisfiable',
          data: { contentRange: `bytes */${size}` },
        })
      }
      object = resolved.r2Range ? await R2.get(fileKey, { range: resolved.r2Range }) : await R2.get(fileKey)
    }
    else {
      object = await R2.get(fileKey)
    }
  }
  catch (error) {
    if ((error as { status?: number }).status === 416)
      throw error
    throw createError({ status: 502, statusText: 'R2 read failed' })
  }

  if (!object) {
    throw createError({ status: 404, statusText: 'File not found' })
  }

  const fullSize = object.size
  const resolved = resolveRange(rangeHeader, fullSize)
  if (resolved === 'invalid') {
    throw createError({
      status: 416,
      statusText: 'Range Not Satisfiable',
      data: { contentRange: `bytes */${fullSize}` },
    })
  }

  const contentType = object.httpMetadata?.contentType || link.fileType || 'application/octet-stream'
  const ext = fileKey.includes('.') ? `.${fileKey.split('.').pop()}` : ''
  const fileName = link.fileName || `${link.slug}${ext}`
  const disposition: 'inline' | 'attachment' = options.forceDownload || link.type !== 'video' ? 'attachment' : 'inline'

  const headers = new Headers()
  headers.set('Content-Type', contentType)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('ETag', object.httpEtag)
  headers.set('Content-Disposition', encodeContentDisposition(disposition, fileName))
  headers.set('Cache-Control', link.password ? 'private, no-store' : 'public, max-age=3600')
  if (resolved.status === 206) {
    headers.set('Content-Range', `bytes ${resolved.start}-${resolved.end}/${fullSize}`)
    headers.set('Content-Length', String(resolved.end - resolved.start + 1))
  }
  else {
    headers.set('Content-Length', String(fullSize))
  }

  return new Response(object.body, {
    status: resolved.status,
    headers,
  })
}
