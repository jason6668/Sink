import { fetchRealtimeSnapshot } from '../../utils/realtime-wae'

/**
 * 实时分析 SSE 推送端点：GET /api/realtime/stream
 *
 *  - 每 5s 推送一次 `event: stats`（快照：visits5m / visitors5m / rate / perMinute / events）
 *  - 连接保持约 5 分钟（60 tick）后发送 `event: bye` 并关闭；
 *    浏览器 EventSource 会自动重连，形成无限续播。
 *  - 鉴权沿用 2.auth 中间件：常规 fetch 自带 Bearer；EventSource 无法携带 Header，
 *    需要 PATCH 2.auth 支持 `?access_token=`（见 PATCHES.md），Cloudflare Access 部署不受影响。
 *  - `?slug=` 可选，支持逗号分隔多 slug（与实时页过滤器联动）。
 */

const TICK_INTERVAL_MS = 5000
const MAX_TICKS = 60

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const slug = typeof query.slug === 'string' && query.slug.trim() ? query.slug.trim() : undefined

  let cancelled = false

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (name: string, data: unknown) => {
        if (cancelled)
          return
        try {
          controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`))
        }
        catch {
          cancelled = true
        }
      }

      try {
        for (let tick = 0; tick < MAX_TICKS; tick++) {
          if (cancelled)
            break
          const startedAt = Date.now()
          try {
            const snapshot = await fetchRealtimeSnapshot(event, slug)
            send('stats', snapshot)
          }
          catch {
            send('error', { message: 'analytics query failed' })
          }
          if (cancelled)
            break
          const elapsed = Date.now() - startedAt
          await new Promise(resolve => setTimeout(resolve, Math.max(0, TICK_INTERVAL_MS - elapsed)))
        }
      }
      finally {
        send('bye', {})
        cancelled = true
        try {
          controller.close()
        }
        catch {
          // already closed by client
        }
      }
    },
    cancel() {
      cancelled = true
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
})
