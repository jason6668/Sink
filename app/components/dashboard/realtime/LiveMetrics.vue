<script setup lang="ts">
import { Activity } from '@lucide/vue'
import NumberFlow from '@number-flow/vue'

/**
 * 实时指标卡：SSE 推送的「活跃访客 / 近5分钟点击 / 每分钟均值 + 30 分钟柱状图」。
 * 放在实时页左侧图表卡下方（lg 布局绝对定位），移动端按文档流堆叠。
 * 数据来自 /api/realtime/stream（见 useRealtimeStream），slug 过滤器与页面联动。
 */

const realtimeStore = useDashboardRealtimeStore()
const isPaused = inject(REALTIME_PAUSED_KEY, shallowRef(false))

function getSlugFilter() {
  const filters = realtimeStore.filters as Record<string, string | undefined>
  return filters.slug || filters.slugs || undefined
}

const { snapshot, error } = useRealtimeStream({ getSlugFilter })

const bars = computed(() => snapshot.value?.perMinute ?? [])
const maxClicks = computed(() => Math.max(1, ...bars.value.map(bucket => bucket.clicks)))

const statusKey = computed(() => {
  if (isPaused.value)
    return 'dashboard.realtime.paused'
  if (error.value)
    return 'dashboard.realtime.stream_reconnecting'
  return 'dashboard.realtime.stream_connected'
})

const dotClass = computed(() => {
  if (isPaused.value)
    return 'bg-muted-foreground/40'
  if (error.value)
    return 'bg-destructive'
  return 'bg-chart-2 motion-safe:animate-pulse'
})

function barHeight(clicks: number): string {
  return `${Math.max(6, Math.round((clicks / maxClicks.value) * 100))}%`
}

function barClass(index: number, clicks: number): string {
  if (isPaused.value)
    return clicks > 0 ? 'bg-chart-2/40' : 'bg-muted'
  if (index === bars.value.length - 1 && clicks > 0)
    return 'bg-chart-1 motion-safe:animate-pulse'
  return clicks > 0 ? 'bg-chart-2' : 'bg-muted'
}
</script>

<template>
  <Card
    size="sm"
    class="
      h-auto
      lg:m-2 lg:w-80
    "
  >
    <CardHeader class="flex flex-row items-center justify-between">
      <h2 class="flex items-center gap-2 text-sm font-medium">
        <span aria-hidden="true" class="inline-flex size-1.5 rounded-full" :class="dotClass" />
        {{ $t('dashboard.realtime.live') }}
      </h2>
      <Activity aria-hidden="true" class="size-4 text-muted-foreground" />
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="grid grid-cols-3 gap-2">
        <div class="space-y-1 text-center">
          <NumberFlow
            class="block text-xl font-bold tabular-nums"
            :value="snapshot?.visitors5m ?? 0"
            :aria-label="$t('dashboard.realtime.active_visitors')"
          />
          <span class="block text-xs text-muted-foreground">{{ $t('dashboard.realtime.active_visitors') }}</span>
        </div>
        <div class="space-y-1 text-center">
          <NumberFlow
            class="block text-xl font-bold tabular-nums"
            :value="snapshot?.visits5m ?? 0"
            :aria-label="$t('dashboard.realtime.clicks_5m')"
          />
          <span class="block text-xs text-muted-foreground">{{ $t('dashboard.realtime.clicks_5m') }}</span>
        </div>
        <div class="space-y-1 text-center">
          <NumberFlow
            class="block text-xl font-bold tabular-nums"
            :value="snapshot?.rate ?? 0"
            :aria-label="$t('dashboard.realtime.rate')"
          />
          <span class="block text-xs text-muted-foreground">{{ $t('dashboard.realtime.rate') }}</span>
        </div>
      </div>

      <div
        class="flex h-14 items-end gap-0.5"
        role="img"
        :aria-label="$t('dashboard.realtime.live')"
      >
        <div
          v-for="(bucket, index) in bars"
          :key="bucket.t"
          class="min-w-0 flex-1 rounded-sm transition-[height] duration-500"
          :class="barClass(index, bucket.clicks)"
          :style="{ height: barHeight(bucket.clicks) }"
          :title="`${bucket.clicks} · ${new Date(bucket.t * 1000).toLocaleTimeString()}`"
        />
      </div>

      <p class="text-xs text-muted-foreground" aria-live="polite">
        {{ $t(statusKey) }}
      </p>
    </CardContent>
  </Card>
</template>
