<script setup lang="ts">
import { Copy, KeyRound, RefreshCw, ShieldCheck, Trash2 } from '@lucide/vue'

definePageMeta({ layout: 'dashboard' })

interface LicenseCode {
  id: number
  code: string
  status: 'unused' | 'activated' | 'revoked'
  deviceId: string | null
  createdAt: number
  activatedAt: number | null
  revokedAt: number | null
  note: string | null
}

const { data, pending, refresh } = await useAsyncData('license-codes', () => useAPI<{ success: boolean, codes: LicenseCode[] }>('/api/license/list'))
const count = ref(1)
const note = ref('')
const generating = ref(false)
const selected = ref<LicenseCode[]>([])
const filter = ref<'all' | LicenseCode['status']>('all')

const codes = computed(() => (data.value?.codes ?? []).filter(item => filter.value === 'all' || item.status === filter.value))
const statusText: Record<LicenseCode['status'], string> = { unused: '未使用', activated: '已激活', revoked: '已撤销' }

async function generate() {
  generating.value = true
  try {
    const result = await useAPI<{ codes: string[] }>('/api/license/generate', { method: 'POST', body: { count: count.value, note: note.value || undefined } })
    await refresh()
    selected.value = (data.value?.codes ?? []).filter(item => result.codes.includes(item.code))
    await copy(result.codes.join('\n'))
  }
  finally { generating.value = false }
}

async function revoke(code: string) {
  await useAPI('/api/license/revoke', { method: 'POST', body: { code } })
  await refresh()
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
}
</script>

<template>
  <main class="mx-auto max-w-6xl space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">
          授权码管理
        </h1>
        <p class="mt-1 text-sm text-muted-foreground">
          给已付款用户生成一次性授权码。生成后会自动复制到剪贴板。
        </p>
      </div>
      <div class="flex items-center gap-2 text-sm text-emerald-600">
        <ShieldCheck
          class="size-4"
        />管理员后台
      </div>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <KeyRound
            class="size-5"
          />生成授权码
        </CardTitle><CardDescription>推荐一位用户生成一个码，用户激活后会绑定当前设备。</CardDescription>
      </CardHeader>
      <CardContent class="flex flex-wrap items-end gap-3">
        <div class="space-y-2">
          <Label>数量</Label><Input
            v-model.number="count" type="number" min="1" max="100" class="w-24"
          />
        </div>
        <div class="min-w-64 flex-1 space-y-2">
          <Label>备注（可选）</Label><Input v-model="note" placeholder="例如：张三 / 2026-09-03" />
        </div>
        <Button :disabled="generating" @click="generate">
          <KeyRound
            class="mr-2 size-4"
          />{{ generating ? '生成中…' : '生成并复制' }}
        </Button>
      </CardContent>
    </Card>

    <Card>
      <CardHeader class="flex flex-row items-center justify-between">
        <div><CardTitle>授权码列表</CardTitle><CardDescription>最多显示最近 500 个授权码。</CardDescription></div><Button variant="outline" size="icon" :disabled="pending" @click="refresh">
          <RefreshCw
            class="size-4" :class="pending && `animate-spin`"
          />
        </Button>
      </CardHeader>
      <CardContent>
        <div class="mb-4 flex flex-wrap gap-2">
          <Button v-for="item in [['all', '全部'], ['unused', '未使用'], ['activated', '已激活'], ['revoked', '已撤销']]" :key="item[0]" size="sm" :variant="filter === item[0] ? 'default' : 'outline'" @click="filter = item[0] as typeof filter">
            {{ item[1] }}
          </Button>
        </div>
        <div
          v-if="!codes.length" class="
            rounded-lg border border-dashed p-10 text-center text-sm
            text-muted-foreground
          "
        >
          暂无授权码。确认收款后，点击上方“生成并复制”。
        </div>
        <div v-else class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>授权码</TableHead><TableHead>状态</TableHead><TableHead>设备</TableHead><TableHead>备注</TableHead><TableHead
                  class="text-right"
                >
                  操作
                </TableHead>
              </TableRow>
            </TableHeader><TableBody>
              <TableRow v-for="item in codes" :key="item.id">
                <TableCell
                  class="font-mono font-medium"
                >
                  {{ item.code }}
                </TableCell><TableCell>
                  <Badge :variant="item.status === 'unused' ? 'secondary' : item.status === 'activated' ? 'default' : 'destructive'">
                    {{ statusText[item.status] }}
                  </Badge>
                </TableCell><TableCell
                  class="max-w-48 truncate font-mono text-xs"
                >
                  {{ item.deviceId ? `${item.deviceId.slice(0, 12)}…` : '未绑定' }}
                </TableCell><TableCell>{{ item.note || '—' }}</TableCell><TableCell
                  class="space-x-1 text-right"
                >
                  <Button size="icon" variant="ghost" title="复制" @click="copy(item.code)">
                    <Copy
                      class="size-4"
                    />
                  </Button><Button v-if="item.status !== 'revoked'" size="icon" variant="ghost" title="撤销" @click="revoke(item.code)">
                    <Trash2
                      class="size-4 text-destructive"
                    />
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>

    <Card class="bg-muted/40">
      <CardHeader>
        <CardTitle class="text-base">
          给用户的操作说明
        </CardTitle>
      </CardHeader><CardContent
        class="space-y-2 text-sm text-muted-foreground"
      >
        <p>1. 确认用户已支付 6.66 元。</p><p>2. 让用户打开 APK「我的 → 试听与授权」，把设备码发给你。</p><p>3. 在上面填写备注并点击「生成并复制」，把复制的授权码私发给用户。</p><p>4. 用户在 APK 输入授权码并点击「激活授权」，成功后本机永久有效。</p>
      </CardContent>
    </Card>
  </main>
</template>
