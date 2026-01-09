import { query, run } from '../../database'
import type { ProviderRow } from '../../database/types'
import { rowToProvider } from '../../database/types'

interface UpdateProviderBody {
  name?: string
  apiKey?: string
  baseUrl?: string | null
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Provider id is required' })
  }

  const body = await readBody<UpdateProviderBody>(event)
  const existing = await query('SELECT * FROM providers WHERE id = ?').get<ProviderRow>(id)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Provider not found' })
  }

  const name = body.name?.trim() || existing.name
  const apiKey = body.apiKey?.trim() ?? existing.api_key
  const baseUrl = body.baseUrl === null ? null : (body.baseUrl?.trim() || existing.base_url)

  await run(
    `UPDATE providers
     SET name = ?, api_key = ?, base_url = ?, updated_at = ?
     WHERE id = ?`,
    [name, apiKey, baseUrl, Date.now(), id]
  )

  const row = await query('SELECT * FROM providers WHERE id = ?').get<ProviderRow>(id)
  if (!row) {
    throw createError({ statusCode: 500, message: 'Failed to update provider' })
  }
  return rowToProvider(row)
})
