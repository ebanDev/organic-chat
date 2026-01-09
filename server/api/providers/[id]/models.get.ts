import { query } from '../../../database'
import type { ProviderRow } from '../../../database/types'
import { resolveProviderBaseUrl } from '../../../utils/provider'

interface ModelsResponse {
  data?: Array<{ id?: string }>
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!

  const provider = await query('SELECT * FROM providers WHERE id = ?').get<ProviderRow>(id)
  if (!provider) {
    throw createError({ statusCode: 404, message: 'Provider not found' })
  }
  if (!provider.api_key?.trim()) {
    throw createError({ statusCode: 400, message: 'Provider has no API key configured' })
  }

  const baseUrl = resolveProviderBaseUrl(provider.base_url)
  const response = await fetch(`${baseUrl}/models`, {
    headers: {
      Authorization: `Bearer ${provider.api_key}`
    }
  })

  if (!response.ok) {
    const message = await response.text()
    throw createError({
      statusCode: response.status,
      message: message || 'Failed to fetch models'
    })
  }

  const payload = (await response.json()) as ModelsResponse
  const models = (payload.data || [])
    .map(model => model.id)
    .filter((id): id is string => Boolean(id))
    .sort()

  return { models }
})
