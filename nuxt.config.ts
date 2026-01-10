// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/mdc',
    '@vite-pwa/nuxt',
    '@pinia/nuxt',
    'pinia-plugin-persistedstate/nuxt'
  ],

  imports: {
    dirs: ['stores']
  },

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'system',
    fallback: 'light',
    classSuffix: ''
  },

  runtimeConfig: {
    authKey: process.env.AUTH_KEY ?? '',
    authCookieName: process.env.AUTH_COOKIE_NAME ?? 'nuxtllm_auth',
    obsidianVaultPath: process.env.OBSIDIAN_VAULT_PATH ?? '',
    public: {
      authCookieName: process.env.AUTH_COOKIE_NAME ?? 'nuxtllm_auth',
      authEnabled: Boolean(process.env.AUTH_KEY)
    }
  },

  compatibilityDate: '2025-01-15',

  typescript: {
    strict: true,
    typeCheck: true,
    tsConfig: {
      compilerOptions: {
        types: ['bun']
      },
      include: ['../types/**/*.d.ts']
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'Organic Chat',
      short_name: 'Organic',
      description: 'A fast, simple AI chat application',
      theme_color: '#0f766e',
      background_color: '#ffffff',
      display: 'standalone',
      start_url: '/',
      scope: '/',
      icons: [
        {
          src: '/icons/icon-192.png',
          sizes: '192x192',
          type: 'image/png'
        },
        {
          src: '/icons/icon-512.png',
          sizes: '512x512',
          type: 'image/png'
        },
        {
          src: '/icons/icon-192-maskable.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable'
        },
        {
          src: '/icons/icon-512-maskable.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ]
    },
    devOptions: {
      enabled: true
    },
    workbox: {
      globPatterns: ['**/*'],
      navigateFallback: '/offline.html',
      navigateFallbackDenylist: [/^\/api\//],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          urlPattern: ({ request }) => request.destination === 'document',
          handler: 'NetworkFirst',
          options: {
            cacheName: 'pages',
            networkTimeoutSeconds: 3
          }
        },
        {
          urlPattern: ({ request }) => request.destination === 'script'
            || request.destination === 'style'
            || request.destination === 'worker',
          handler: 'StaleWhileRevalidate',
          options: {
            cacheName: 'assets'
          }
        },
        {
          urlPattern: ({ request }) => request.destination === 'image',
          handler: 'CacheFirst',
          options: {
            cacheName: 'images',
            expiration: {
              maxEntries: 100,
              maxAgeSeconds: 60 * 60 * 24 * 30
            }
          }
        }
      ]
    }
  }
})
