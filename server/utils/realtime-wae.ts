import type { H3Event } from 'h3'
import type { LogEvent } from '#shared/types/events'
import { sql } from 'kysely'

/**
 * 实时分析的 WAE（Workers Analytics Engine）查询层。
 * 与 server/api/logs/events.get.ts 相同的查询通道（useWAE + kysely 编译器），
 * 输出一份聚合快照供 SSE 推送：
 *   visits5m / visitors5m / rate（近5分钟每分钟均值）/ perMinute（30 个分钟桶）/ events（最近 10 条）
 */

export interface RealtimeSnapshot {
  ts: number
  visits5m: number
  visitors5m: number
  rate: number
  perMinute: { t: number, clicks: number }[]
  events: LogEvent[]
}

type WaeRow = Record<string, unknown>

function escapeWaeValue(value: string): string {
  return value.replaceAll('\'', '\'\'')
}

/** 与 events.get.ts 一致的内容哈希，保证同一事件在多次快照中 id 稳定（前端据此去重） */
function snapshotEventId(row: WaeRow): string {
  const source = Object.keys(row).sort().map(key => `${key}\0${String(row[key] ?? '')}`).join('\x01')
  let first = 0x811C9DC5
  let second = 0x9E3779B9
  for (let index = 0; index < source.length; index++) {
    const code = source.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ code, 0x85EBCA6B)
  }
  return `wae_${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`
}

function waeTimestampToSeconds(value: unknown): number {
  return Math.floor(new Date(`${String(value)}Z`).getTime() / 1000)
}

function rowToLogEvent(row: WaeRow): LogEvent {
  return {
    id: snapshotEventId(row),
    slug: String(row.blob1 ?? ''),
    os: row.blob11 ? String(row.blob11) : undefined,
    browser: row.blob12 ? String(row.blob12) : undefined,
    country: row.blob6 ? String(row.blob6) : undefined,
    city: row.blob8 ? String(row.blob8) : undefined,
    latitude: row.double1 !== undefined ? Number(row.double1) : undefined,
    longitude: row.double2 !== undefined ? Number(row.double2) : undefined,
    COLO: row.blob16 ? String(row.blob16) : undefined,
    timestamp: waeTimestampToSeconds(row.timestamp),
  }
}

async function runWaeRows(event: H3Event, query: unknown): Promise<WaeRow[]> {
  const result = await useWAE(event, query) as { data?: WaeRow[] } | undefined
  return result?.data ?? []
}

function parseMinuteKey(value: unknown): number {
  // WAE interval(timestamp, 1 minute) → "YYYY-MM-DD HH:MM:00"（UTC）
  return Math.floor(new Date(String(value).replace(' ', 'T').concat('Z')).getTime() / 1000)
}

function buildPerMinuteSeries(rows: WaeRow[]): { t: number, clicks: number }[] {
  const byMinute = new Map<number, number>()
  for (const row of rows) {
    if (!row.minute)
      continue
    byMinute.set(parseMinuteKey(row.minute), Number(row.clicks ?? 0))
  }

  const now = Math.floor(Date.now() / 1000)
  const currentBucket = now - (now % 60)
  const series: { t: number, clicks: number }[] = []
  for (let offset = 29; offset >= 0; offset--) {
    const t = currentBucket - offset * 60
    series.push({ t, clicks: byMinute.get(t) ?? 0 })
  }
  return series
}

function buildSlugCondition(slug: string | undefined): string {
  if (!slug)
    return ''
  const slugs = slug.split(',').map(item => item.trim()).filter(Boolean)
  if (!slugs.length)
    return ''
  const list = slugs.map(item => `'${escapeWaeValue(item)}'`).join(', ')
  return ` AND blob1 IN (${list})`
}

export async function fetchRealtimeSnapshot(event: H3Event, slug?: string): Promise<RealtimeSnapshot> {
  const { dataset } = useRuntimeConfig(event)
  const base = createAnalyticsQuery(dataset)
  const slugCondition = buildSlugCondition(slug)

  // 近 5 分钟点击量 / 活跃访客（去重 IP）
  const countersRows = await runWaeRows(
    event,
    base
      .select(sql`count() as visits, uniqExact(blob4) as visitors`)
      .where(sql.raw(`timestamp > NOW() - INTERVAL 5 MINUTE${slugCondition}`)),
  )

  // 近 30 分钟每分钟点击序列
  const seriesRows = await runWaeRows(
    event,
    base
      .select(sql`interval(timestamp, 1 minute) as minute, count() as clicks`)
      .where(sql.raw(`timestamp > NOW() - INTERVAL 30 MINUTE${slugCondition}`))
      .groupBy(sql.raw('minute'))
      .orderBy(sql.raw('minute asc')),
  )

  // 最近 10 条点击事件
  const eventRows = await runWaeRows(
    event,
    base
      .selectAll()
      .where(sql.raw(`timestamp > NOW() - INTERVAL 5 MINUTE${slugCondition}`))
      .orderBy('timestamp', 'desc')
      .limit(sql.lit(10)),
  )

  const perMinute = buildPerMinuteSeries(seriesRows)
  const lastFive = perMinute.slice(-5)
  const rate = lastFive.length
    ? Math.round((lastFive.reduce((sum, bucket) => sum + bucket.clicks, 0) / lastFive.length) * 10) / 10
    : 0

  const counters = countersRows[0] ?? {}

  return {
    ts: Math.floor(Date.now() / 1000),
    visits5m: Number(counters.visits ?? 0),
    visitors5m: Number(counters.visitors ?? 0),
    rate,
    perMinute,
    events: eventRows.map(rowToLogEvent),
  }
}
