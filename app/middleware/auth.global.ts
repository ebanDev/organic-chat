export default defineNuxtRouteMiddleware((to) => {
  const config = useRuntimeConfig()
  if (!config.public.authEnabled) return
  if (to.path === '/login') return

  const cookie = useCookie<string | null>(config.public.authCookieName)
  if (!cookie.value) {
    return navigateTo('/login')
  }
})
