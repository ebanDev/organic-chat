const PUBLIC_PATH_PREFIXES = [
  '/_nuxt/',
  '/favicon',
  '/icon',
  '/manifest',
  '/robots',
  '/sitemap',
  '/pwa',
  '/sw',
  '/workbox'
]

export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const authKey = config.authKey?.trim()
  if (!authKey) return

  const path = event.path || getRequestURL(event).pathname
  if (path === '/login' || path.startsWith('/login/')) return
  if (path.startsWith('/api/auth')) return
  if (PUBLIC_PATH_PREFIXES.some(prefix => path.startsWith(prefix))) return

  const cookieName = config.authCookieName || 'nuxtllm_auth'
  const cookieValue = getCookie(event, cookieName)

  if (cookieValue === authKey) return

  if (path.startsWith('/api/')) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  return sendRedirect(event, '/login')
})
