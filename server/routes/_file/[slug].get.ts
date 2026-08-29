import { verifyFileToken } from '../../utils/file-link'

/**
 * 文件/视频取流端点：GET /_file/{slug}
 *
 *  - 视频播放页 <video src> 的数据源（支持 Range 拖动进度条）
 *  - 也供高级用法直链下载：curl -H "x-link-password: xxx" -OJL https://host/_file/{slug}
 *  - 过期校验复用 link-store：getLink 只返回未过期的链接（expired → 404）
 *  - 密码校验二选一：
 *      ?sig=   密码验证通过后由播放页携带的短期 HMAC 令牌（10 分钟）
 *      x-link-password 请求头：明文密码，服务端 PBKDF2 校验
 *  - ?download=1 强制 attachment（视频也可直接下载）
 *
 * 路径前缀 `_file` 带下划线，与 `_assets` 一致，天然绕过重定向中间件的 slug 解析。
 */

export default defineEventHandler(async (event) => {
  const slugParam = getRouterParam(event, 'slug') || ''
  const slug = normalizeSlug(event, slugParam.split('/')[0]!)

  const link = await getLink(event, slug)
  if (!link || (link.type !== 'file' && link.type !== 'video') || !link.fileKey) {
    throw createError({ status: 404, statusText: 'File not found' })
  }

  if (link.password) {
    const sig = getQuery(event).sig
    const sigValid = typeof sig === 'string' && await verifyFileToken(event, sig, link.slug)

    if (!sigValid) {
      const headerPassword = getHeader(event, 'x-link-password')
      const headerValid = !!headerPassword && await verifyLinkPassword(headerPassword, link.password)
      if (!headerValid) {
        throw createError({ status: 401, statusText: 'Password required' })
      }
    }
  }

  const forceDownload = getQuery(event).download === '1'
  return await streamFileFromR2(event, link, { forceDownload })
})
