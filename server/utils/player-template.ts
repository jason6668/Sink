import type { Link } from '#shared/schemas/link'
import { escape } from 'es-toolkit/string'

/**
 * 视频播放页（在重定向中间件里替代 302 返回）：
 *  - 极简 / 自适应手机端 / 支持系统暗黑模式（固定深色，与密码页同一套配色）
 *  - 携带 OG / Twitter meta，社交平台爬虫可直接预览
 *  - <video> 的 src 指向 /_file/{slug}（受密码保护时带短期签名 sig）
 */

function formatBytes(size?: number): string {
  if (!size || size <= 0)
    return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = size
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

export function generateVideoPlayerHtml(link: Link, src: string, baseUrl: string): string {
  const title = link.title || link.fileName || link.slug
  const sizeLabel = formatBytes(link.fileSize)
  const hasImage = !!link.image
  const imageUrl = hasImage && link.image!.startsWith('/') ? `${baseUrl}${link.image}` : link.image

  const metaTags = [
    link.description ? `<meta name="description" content="${escape(link.description)}">` : '',
    `<meta property="og:type" content="video.other">`,
    `<meta property="og:url" content="${escape(baseUrl)}/${escape(link.slug)}">`,
    `<meta property="og:title" content="${escape(title)}">`,
    link.description ? `<meta property="og:description" content="${escape(link.description)}">` : '',
    hasImage ? `<meta property="og:image" content="${escape(imageUrl!)}">` : '',
    `<meta property="og:video" content="${escape(src.startsWith('/') ? `${baseUrl}${src}` : src)}">`,
    `<meta name="twitter:card" content="${hasImage ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escape(title)}">`,
    hasImage ? `<meta name="twitter:image" content="${escape(imageUrl!)}">` : '',
  ].filter(Boolean).join('\n    ')

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="robots" content="noindex">
    <title>${escape(title)}</title>
    ${metaTags}
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#09090b;color:#fafafa;padding:1rem}
      .wrap{width:100%;max-width:960px}
      .card{background:#0a0a0a;border:1px solid #27272a;border-radius:12px;overflow:hidden;box-shadow:0 10px 25px -5px rgba(0,0,0,.5)}
      video{display:block;width:100%;max-height:70vh;background:#000}
      .meta{padding:1rem 1.25rem;display:flex;flex-direction:column;gap:.5rem}
      h1{font-size:1rem;font-weight:600;letter-spacing:-.015em;word-break:break-word}
      .sub{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
      .size{font-size:.75rem;color:#a1a1aa}
      a.btn{display:inline-flex;align-items:center;gap:.4rem;padding:.4rem .9rem;border:1px solid #27272a;border-radius:6px;font-size:.8125rem;font-weight:500;color:#fafafa;text-decoration:none;transition:background-color .15s ease}
      a.btn:hover{background:#18181b}
    </style>
</head>
<body>
    <div class="wrap">
        <div class="card">
            <video controls playsinline preload="metadata" src="${escape(src)}"></video>
            <div class="meta">
                <h1>${escape(title)}</h1>
                <div class="sub">
                    <span class="size">${sizeLabel ? `${escape(sizeLabel)}` : ''}</span>
                    <a class="btn" href="${escape(src)}${src.includes('?') ? '&' : '?'}download=1" download>Download</a>
                </div>
            </div>
        </div>
    </div>
</body>
</html>`
}
