<script setup lang="ts">
import type { UploadFileResult } from '@/types/upload-file'
import { Check, Copy, File as FileIcon, FileVideo, Link2, Loader2, Lock, UploadCloud } from '@lucide/vue'
import { getAuthToken } from '@/utils/auth-token'

/**
 * 文件 / 视频转链接上传对话框：
 *  - 拖拽或点选文件（视频自动识别为 video 类型，播放页展示）
 *  - 可选：自定义短链、标题、访问密码
 *  - 可选：过期时间（永久 / 1小时 / 24小时 / 7天 / 30天 / 自定义）
 *  - XHR 上传（带进度条），完成后展示短链 + 复制
 *
 * 用法：<DashboardFileUploadDialog><Button>上传文件</Button></DashboardFileUploadDialog>
 * 接口：POST /api/upload/file（见 server/api/upload/file.post.ts）
 */

const open = defineModel<boolean>('open', { default: false })

const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const isDragging = shallowRef(false)
const slug = ref('')
const title = ref('')
const password = ref('')
const expiryPreset = ref<'never' | '1h' | '24h' | '7d' | '30d' | 'custom'>('never')
const customExpiry = ref('')
const progress = shallowRef(0)
const uploading = shallowRef(false)
const errorText = ref('')
const result = ref<UploadFileResult | null>(null)
const copied = shallowRef(false)

const expiryPresets: { value: typeof expiryPreset.value, labelKey: string }[] = [
  { value: 'never', labelKey: 'dashboard.upload.expiration_never' },
  { value: '1h', labelKey: 'dashboard.upload.expiration_1h' },
  { value: '24h', labelKey: 'dashboard.upload.expiration_24h' },
  { value: '7d', labelKey: 'dashboard.upload.expiration_7d' },
  { value: '30d', labelKey: 'dashboard.upload.expiration_30d' },
  { value: 'custom', labelKey: 'dashboard.upload.expiration_custom' },
]

const isVideo = computed(() => !!file.value?.type.startsWith('video/'))

const expirationSeconds = computed<number | undefined>(() => {
  const now = Math.floor(Date.now() / 1000)
  switch (expiryPreset.value) {
    case '1h':
      return now + 3600
    case '24h':
      return now + 86400
    case '7d':
      return now + 7 * 86400
    case '30d':
      return now + 30 * 86400
    case 'custom': {
      if (!customExpiry.value)
        return undefined
      const ts = Math.floor(new Date(customExpiry.value).getTime() / 1000)
      return Number.isFinite(ts) && ts > now ? ts : undefined
    }
    default:
      return undefined
  }
})

function reset() {
  file.value = null
  slug.value = ''
  title.value = ''
  password.value = ''
  expiryPreset.value = 'never'
  customExpiry.value = ''
  progress.value = 0
  uploading.value = false
  errorText.value = ''
  result.value = null
  copied.value = false
}

function pickFile() {
  fileInput.value?.click()
}

function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = input.files?.[0]
  if (selected) {
    file.value = selected
    errorText.value = ''
  }
  input.value = ''
}

function onDrop(event: DragEvent) {
  isDragging.value = false
  const dropped = event.dataTransfer?.files?.[0]
  if (dropped) {
    file.value = dropped
    errorText.value = ''
  }
}

function upload(): Promise<UploadFileResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData()
    formData.append('file', file.value!)
    if (slug.value.trim())
      formData.append('slug', slug.value.trim())
    if (title.value.trim())
      formData.append('title', title.value.trim())
    if (password.value)
      formData.append('password', password.value)
    if (expirationSeconds.value)
      formData.append('expiration', String(expirationSeconds.value))

    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload/file')
    xhr.setRequestHeader('Authorization', `Bearer ${getAuthToken() ?? ''}`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress.value = Math.round((event.loaded / event.total) * 100)
    }
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText)
        if (xhr.status >= 200 && xhr.status < 300)
          resolve(body as UploadFileResult)
        else
          reject(new Error(body?.statusText || body?.message || `HTTP ${xhr.status}`))
      }
      catch {
        reject(new Error(`HTTP ${xhr.status}`))
      }
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.send(formData)
  })
}

async function submit() {
  if (!file.value || uploading.value)
    return
  uploading.value = true
  errorText.value = ''
  progress.value = 0
  try {
    result.value = await upload()
  }
  catch (error) {
    errorText.value = error instanceof Error ? error.message : String(error)
  }
  finally {
    uploading.value = false
  }
}

async function copyLink() {
  if (!result.value)
    return
  await navigator.clipboard.writeText(result.value.url)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}

function formatExpiration(ts: number | null): string {
  if (!ts)
    return ''
  return new Date(ts * 1000).toLocaleString()
}

watch(open, (isOpen) => {
  if (isOpen)
    reset()
})
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <slot />
    </DialogTrigger>
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ $t('dashboard.upload.title') }}</DialogTitle>
        <DialogDescription>{{ $t('dashboard.upload.description') }}</DialogDescription>
      </DialogHeader>

      <!-- 已完成 -->
      <div v-if="result" class="space-y-3">
        <div
          class="
            flex items-center gap-2 rounded-md border border-border bg-muted/30
            p-3
          "
        >
          <Check class="size-4 shrink-0 text-chart-2" aria-hidden="true" />
          <span class="text-sm font-medium">{{ $t('dashboard.upload.upload_done') }}</span>
          <Badge
            v-if="result.passwordProtected" variant="secondary" class="
              ml-auto gap-1
            "
          >
            <Lock class="size-3" aria-hidden="true" />
            {{ $t('dashboard.upload.protected') }}
          </Badge>
        </div>

        <div class="flex items-center gap-2 rounded-md border border-border p-2">
          <Link2 class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate font-mono text-sm">{{ result.url }}</span>
          <Button type="button" size="sm" variant="outline" @click="copyLink">
            <Check v-if="copied" class="size-3.5" aria-hidden="true" />
            <Copy v-else class="size-3.5" aria-hidden="true" />
            {{ $t(copied ? 'dashboard.upload.copied' : 'dashboard.upload.copy') }}
          </Button>
        </div>

        <p v-if="result.expiration" class="text-xs text-muted-foreground">
          {{ $t('dashboard.upload.expires_at') }}: {{ formatExpiration(result.expiration) }}
        </p>

        <div class="flex justify-end gap-2">
          <Button type="button" variant="outline" @click="reset">
            {{ $t('dashboard.upload.another') }}
          </Button>
          <Button type="button" @click="open = false">
            {{ $t('common.close') }}
          </Button>
        </div>
      </div>

      <!-- 表单 -->
      <template v-else>
        <div
          class="
            flex flex-col items-center justify-center gap-2 rounded-lg border
            border-dashed border-border p-6 text-center transition-colors
          "
          :class="{ 'border-primary bg-muted/40': isDragging }"
          role="button"
          tabindex="0"
          :aria-label="$t('dashboard.upload.drop_hint')"
          @click="pickFile"
          @keydown.enter.prevent="pickFile"
          @dragover.prevent="isDragging = true"
          @dragleave.prevent="isDragging = false"
          @drop.prevent="onDrop"
        >
          <FileVideo v-if="isVideo" class="size-8 text-muted-foreground" aria-hidden="true" />
          <FileIcon v-else class="size-8 text-muted-foreground" aria-hidden="true" />
          <p class="text-sm text-muted-foreground">
            {{ file ? file.name : $t('dashboard.upload.drop_hint') }}
          </p>
          <p v-if="file" class="text-xs text-muted-foreground">
            {{ (file.size / 1024 / 1024).toFixed(2) }} MB
          </p>
          <input
            ref="fileInput"
            type="file"
            class="sr-only"
            @change="onFileChange"
          >
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground" for="upload-slug">{{ $t('dashboard.upload.slug_label') }}</label>
            <Input id="upload-slug" v-model="slug" type="text" :placeholder="$t('dashboard.upload.auto')" autocomplete="off" />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-medium text-muted-foreground" for="upload-title">{{ $t('dashboard.upload.title_label') }}</label>
            <Input id="upload-title" v-model="title" type="text" autocomplete="off" />
          </div>
        </div>

        <div class="space-y-1">
          <label class="text-xs font-medium text-muted-foreground" for="upload-expiry">{{ $t('dashboard.upload.expiration_label') }}</label>
          <select
            id="upload-expiry"
            v-model="expiryPreset"
            class="
              h-9 w-full rounded-md border border-border bg-transparent px-3
              text-sm outline-none
              focus:ring-1 focus:ring-ring
            "
          >
            <option v-for="preset in expiryPresets" :key="preset.value" :value="preset.value">
              {{ $t(preset.labelKey) }}
            </option>
          </select>
          <Input
            v-if="expiryPreset === 'custom'"
            v-model="customExpiry"
            type="datetime-local"
            class="mt-1"
          />
        </div>

        <div class="space-y-1">
          <label class="text-xs font-medium text-muted-foreground" for="upload-password">{{ $t('dashboard.upload.password_label') }}</label>
          <Input id="upload-password" v-model="password" type="password" :placeholder="$t('dashboard.upload.password_placeholder')" autocomplete="new-password" />
        </div>

        <div v-if="uploading" class="space-y-1">
          <Progress :model-value="progress" />
          <p class="text-center text-xs text-muted-foreground">
            {{ $t('dashboard.upload.uploading') }} {{ progress }}%
          </p>
        </div>

        <p v-if="errorText" class="text-sm text-destructive" role="alert">
          {{ errorText }}
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="uploading" @click="open = false">
            {{ $t('common.cancel') }}
          </Button>
          <Button type="button" :disabled="!file || uploading" @click="submit">
            <Loader2 v-if="uploading" class="size-4 animate-spin" aria-hidden="true" />
            <UploadCloud v-else class="size-4" aria-hidden="true" />
            {{ $t('dashboard.upload.submit') }}
          </Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>
