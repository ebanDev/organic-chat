interface AuthBody {
  key: string
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig()
  const authKey = config.authKey?.trim()

  if (!authKey) {
    throw createError({ statusCode: 500, message: 'AUTH_KEY is not configured' })
  }

  const body = await readBody<AuthBody>(event)
  if (!body?.key?.trim()) {
    throw createError({ statusCode: 400, message: 'key is required' })
  }

  if (body.key.trim() !== authKey) {
    throw createError({ statusCode: 401, message: 'Invalid key' })
  }

  const cookieName = config.authCookieName || 'nuxtllm_auth'
  const isProd = process.env.NODE_ENV === 'production'

  setCookie(event, cookieName, authKey, {
    httpOnly: false,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  })

  return { ok: true }
})
