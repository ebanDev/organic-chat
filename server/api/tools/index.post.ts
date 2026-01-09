import { query, run } from '../../database'
import type { ToolRow } from '../../database/types'
import { rowToTool } from '../../database/types'

interface CreateToolBody {
  id?: string
  type: 'web_navigate'
  name: string
  apiKey: string
  engineId: string
  tavilyApiKey: string
  enabled?: boolean
  createdAt?: number
  updatedAt?: number
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateToolBody>(event)
  const name = body.name?.trim()
  const apiKey = body.apiKey?.trim() || ''
  const engineId = body.engineId?.trim() || ''
  const tavilyApiKey = body.tavilyApiKey?.trim() || ''
  const enabled = body.enabled !== false

  if (!body.type) {
    throw createError({ statusCode: 400, message: 'Tool type is required' })
  }
  if (!name) {
    throw createError({ statusCode: 400, message: 'Name is required' })
  }
  if (enabled) {
    if (!apiKey) {
      throw createError({ statusCode: 400, message: 'API key is required' })
    }
    if (!engineId) {
      throw createError({ statusCode: 400, message: 'Engine id is required' })
    }
    if (!tavilyApiKey) {
      throw createError({ statusCode: 400, message: 'Tavily API key is required' })
    }
  }

  const now = Date.now()
  const id = body.id?.trim() || crypto.randomUUID()
  const createdAt = body.createdAt ?? now
  const updatedAt = body.updatedAt ?? now

  await run(
    `INSERT INTO tools (id, type, name, api_key, engine_id, tavily_api_key, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      body.type,
      name,
      apiKey,
      engineId,
      tavilyApiKey,
      enabled ? 1 : 0,
      createdAt,
      updatedAt
    ]
  )

  const row = await query('SELECT * FROM tools WHERE id = ?').get<ToolRow>(id)
  if (!row) {
    throw createError({ statusCode: 500, message: 'Failed to create tool' })
  }
  return rowToTool(row)
})
