import { query, run } from '../../database'
import type { ToolRow } from '../../database/types'
import { rowToTool } from '../../database/types'

interface UpdateToolBody {
  name?: string
  apiKey?: string
  engineId?: string
  tavilyApiKey?: string
  enabled?: boolean
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Tool id is required' })
  }

  const body = await readBody<UpdateToolBody>(event)
  const existing = await query('SELECT * FROM tools WHERE id = ?').get<ToolRow>(id)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Tool not found' })
  }

  const name = body.name?.trim() || existing.name
  const apiKey = body.apiKey?.trim() ?? existing.api_key
  const engineId = body.engineId?.trim() ?? existing.engine_id
  const tavilyApiKey = body.tavilyApiKey?.trim() ?? existing.tavily_api_key
  const enabled = body.enabled === undefined ? existing.enabled : (body.enabled ? 1 : 0)

  if (enabled && (!apiKey || !engineId || !tavilyApiKey)) {
    throw createError({ statusCode: 400, message: 'API keys are required to enable the tool' })
  }

  await run(
    `UPDATE tools
     SET name = ?, api_key = ?, engine_id = ?, tavily_api_key = ?, enabled = ?, updated_at = ?
     WHERE id = ?`,
    [name, apiKey, engineId, tavilyApiKey, enabled, Date.now(), id]
  )

  const row = await query('SELECT * FROM tools WHERE id = ?').get<ToolRow>(id)
  if (!row) {
    throw createError({ statusCode: 500, message: 'Failed to update tool' })
  }
  return rowToTool(row)
})
