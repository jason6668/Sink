import type { LogEvent } from '#shared/types/events'
import { getAuthToken } from '@/utils/auth-token'

/**
 * 实时分析 SSE 客户端：消费 /api/realtime/stream
 *  - EventSource 断线自动重连（服务端每 5 分钟主动收尾一轮，浏览器自动续连）
 *  - 与实时页暂停按钮联动（REALTIME_PAUSED_KEY）
 *  - slug 过滤变化时自动重建连接
 */

export interface RealtimeSnapshot {
  ts: number
  visits5m: number
  visitors5m: number
  rate: number
  perMinute: { t: number, clicks: number }[]
  events: LogEvent[]
}

export function useRealtimeStream(options: { getSlugFilter?: () => string | undefined } = {}) {
  const isPaused = inject(REALTIME_PAUSED_KEY, shallowRef(false))

  const snapshot = shallowRef<RealtimeSnapshot | null>(null)
  const connected = shallowRef(false)
  const error = shallowRef(false)

  let source: EventSource | null = null
  let currentSlugFilter: string | undefined

  function buildUrl(slugFilter: string | undefined): string {
    const params = new URLSearchParams()
    const token = getAuthToken()
    if (token)
      params.set('access_token', token)
    if (slugFilter)
      params.set('slug', slugFilter)
    const queryString = params.toString()
    return `/api/realtime/stream${queryString ? `?${queryString}` : ''}`
  }

  function close() {
    source?.close()
    source = null
    connected.value = false
  }

  function open() {
    close()
    source = new EventSource(buildUrl(currentSlugFilter))

    source.onopen = () => {
      connected.value = true
      error.value = false
    }

    source.addEventListener('stats', (event) => {
      connected.value = true
      error.value = false
      try {
        snapshot.value = JSON.parse((event as MessageEvent).data) as RealtimeSnapshot
      }
      catch {
        // 忽略坏帧
      }
    })

    source.addEventListener('error', () => {
      // 连接中断；EventSource 会自动重连
      connected.value = false
      error.value = true
    })

    source.addEventListener('bye', () => {
      // 服务端本轮结束，等浏览器自动重连
      connected.value = false
    })
  }

  watch(() => options.getSlugFilter?.(), (slugFilter) => {
    const next = slugFilter || undefined
    if (next === currentSlugFilter)
      return
    currentSlugFilter = next
    if (!isPaused.value)
      open()
  })

  watch(isPaused, (paused) => {
    if (paused)
      close()
    else
      open()
  })

  onMounted(() => {
    currentSlugFilter = options.getSlugFilter?.() || undefined
    if (!isPaused.value)
      open()
  })

  onScopeDispose(close)

  return {
    snapshot,
    connected,
    error,
  }
}
