import { randomBytes } from 'node:crypto'
import process from 'node:process'
import tailwindcss from '@tailwindcss/vite'
import { currentLocales } from './i18n/i18n'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  modules: [
    '@nuxtjs/color-mode',
    '@nuxtjs/i18n',
    '@nuxt/eslint',
    '@pinia/nuxt',
    'shadcn-nuxt',
  ],
  devtools: { enabled: true },
  css: ['@/assets/css/tailwind.css'],
  app: {
    head: {
      // Personal branding: every icon surface points at Ma Laoshi's logo. The
      // PNG is served from public/ rather than the remote host so the favicon
      // keeps working if tc.8818618.xyz is unreachable.
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/icon-192.png' },
        { rel: 'icon', type: 'image/png', sizes: '512x512', href: '/icon-512.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
        { rel: 'shortcut icon', href: '/favicon.ico' },
      ],
    },
  },
  colorMode: {
    classSuffix: '',
  },
  runtimeConfig: {
    siteToken: process.env.NUXT_SITE_TOKEN || randomBytes(32).toString('base64url'),
    cfAccessTeamDomain: '',
    cfAccessAud: '',
    redirectStatusCode: '301',
    linkCacheTtl: 60,
    redirectWithQuery: false,
    redirectNoStore: false,
    homeURL: '',
    cfAccountId: '',
    cfApiToken: '',
    dataset: 'sink',
    aiModel: '@cf/qwen/qwen3-30b-a3b-fp8',
    aiPrompt: `You are a URL shortening assistant, please shorten the URL provided by the user into a SLUG. The SLUG information should be derived from the URL and page content (if provided). Do not make any assumptions beyond the given information. A SLUG is human-readable and should not exceed three words and can be validated using regular expressions {slugRegex} . Only the best one is returned, the format must be JSON reference {"slug": "example-slug"}`,
    aiOgPrompt: `You are an OpenGraph metadata assistant. Please summarize the page content provided by the user into a perfect title and description for an OpenGraph preview. Do not make any assumptions beyond the given information. Only the best one is returned, the format must be JSON reference {"title": "Example Title", "description": "Example description that summarizes the page accurately."}`,
    caseSensitive: false,
    importRequestLimit: 100,
    listQueryLimit: 500,
    disableBotAccessLog: false,
    disableAutoBackup: false,
    // Storage cleanup reclaims R2 objects behind expired links and orphaned
    // uploads. Leave it on unless an operator wants to audit the bucket by hand.
    disableStorageCleanup: false,
    notFoundRedirect: '',
    safeBrowsingDoh: '', // Set to DoH URL to enable auto-detection, e.g. https://family.cloudflare-dns.com/dns-query
    webhookUrl: '',
    webhookSecret: '',
    // OpenRouter powers the conversational agent and MCP tool calling. Leave the
    // key empty to keep both surfaces disabled (they answer 501).
    openrouterApiKey: '',
    openrouterModel: 'qwen/qwen3-235b-a22b-thinking-2507',
    openrouterBaseUrl: 'https://openrouter.ai/api/v1',
    // Separate token for machine clients (MCP, n8n, Telegram bots). Falls back to
    // siteToken when unset so a fresh deploy is not left wide open.
    openApiToken: '',
    licenseAdminToken: '',
    licenseSigningSecret: '',
    public: {
      previewMode: '',
      slugDefaultLength: '6',
      kvBatchLimit: '50',
      agentEnabled: '',
    },
  },
  routeRules: {
    '/dashboard': {
      redirect: '/dashboard/links',
    },
    '/api/**': {
      cors: process.env.NUXT_API_CORS === 'true',
    },
    '/_docs/**': {
      headers: { 'X-Robots-Tag': 'noindex, follow' },
    },
    '/sphere.bin': {
      headers: { 'Cache-Control': 'public, max-age=0, must-revalidate' },
    },
    '/*.json': {
      headers: { 'Cache-Control': 'public, max-age=2592000, immutable' },
    },
    '/*.geojson': {
      headers: { 'Cache-Control': 'public, max-age=2592000, immutable' },
    },
  },
  experimental: {
    enforceModuleCompatibility: true,
  },
  typescript: {
    tsConfig: {
      compilerOptions: {
        types: ['vite/client'],
      },
    },
  },
  compatibilityDate: '2026-07-13',
  nitro: {
    preset: import.meta.env.CF_PAGES !== '1' ? 'cloudflare-module' : undefined,
    experimental: {
      openAPI: true,
    },
    timing: true,
    openAPI: {
      production: 'runtime',
      meta: {
        title: '马老师短链 API',
        description: '马老师专属短链系统的 HTTP API：短链、文件、图片与视频，支持密码、有效期与自动销毁。\n\n[返回首页](/)',
      },
      route: '/_docs/openapi.json',
      ui: {
        scalar: {
          route: '/_docs/scalar',
        },
        swagger: {
          route: '/_docs/swagger',
        },
      },
    },
  },
  vite: {
    plugins: [
      tailwindcss(),
    ],
    worker: {
      format: 'es',
    },
    optimizeDeps: {
      include: [
        '@internationalized/date',
        '@lucide/vue',
        '@number-flow/vue',
        '@tanstack/vue-form',
        '@unovis/vue',
        '@vue/devtools-core',
        '@vue/devtools-kit',
        '@vueuse/core',
        'class-variance-authority',
        'clsx',
        'd3-geo',
        'd3-scale',
        'nanoid',
        'qr-code-styling', // CJS
        'reka-ui',
        'reka-ui/date',
        'tailwind-merge',
        'twgl.js',
        'vaul-vue',
        'virtua/vue',
        'vue-sonner',
        'vue3-simple-icons',
        'zod',
      ],
    },
  },
  eslint: {
    config: {
      standalone: false,
    },
  },
  i18n: {
    locales: currentLocales,
    compilation: {
      strictMessage: false,
      escapeHtml: true,
    },
    strategy: 'no_prefix',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'sink_i18n_redirected',
      redirectOn: 'root',
    },
    baseUrl: '/',
    defaultLocale: 'en-US',
  },
  shadcn: {
    /**
     * Prefix for all the imported component
     */
    prefix: '',
    /**
     * Directory that the component lives in.
     * @default "./components/ui"
     */
    componentDir: './app/components/ui',
  },
})
