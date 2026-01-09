import { query, run } from '../../database'
import type { ProviderRow } from '../../database/types'
import { rowToProvider } from '../../database/types'

interface CreateProviderBody {
  id?: string
  name: string
  apiKey: string
  baseUrl?: string | null
  createdAt?: number
  updatedAt?: number
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateProviderBody>(event)
  const name = body.name?.trim()
  const apiKey = body.apiKey?.trim()
  const baseUrl = body.baseUrl?.trim() || null

  if (!name) {
    throw createError({ statusCode: 400, message: 'Name is required' })
  }
  if (!apiKey) {
    throw createError({ statusCode: 400, message: 'API key is required' })
  }

  const now = Date.now()
  const id = body.id?.trim() || crypto.randomUUID()
  const createdAt = body.createdAt ?? now
  const updatedAt = body.updatedAt ?? now

  await run(
    `INSERT INTO providers (id, name, api_key, base_url, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, name, apiKey, baseUrl, createdAt, updatedAt]
  )

  const row = await query('SELECT * FROM providers WHERE id = ?').get<ProviderRow>(id)
  if (!row) {
    throw createError({ statusCode: 500, message: 'Failed to create provider' })
  }
  return rowToProvider(row)
})
