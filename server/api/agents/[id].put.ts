import { query, run } from '../../database'
import type { AgentRow } from '../../database/types'
import { rowToAgent } from '../../database/types'

interface UpdateAgentBody {
  name?: string
  baseModel?: string
  systemPrompt?: string
  avatarUrl?: string | null
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody<UpdateAgentBody>(event)

  const existing = await query('SELECT * FROM agents WHERE id = ?').get<AgentRow>(id)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Agent not found' })
  }

  const name = body.name?.trim() || existing.name
  const baseModel = body.baseModel?.trim() || existing.base_model
  const systemPrompt = body.systemPrompt?.trim() || existing.system_prompt
  const avatarUrl = body.avatarUrl === null ? null : (body.avatarUrl?.trim() || existing.avatar_url)
  const now = Date.now()

  await run(
    `UPDATE agents SET name = ?, avatar_url = ?, system_prompt = ?, base_model = ?, updated_at = ? WHERE id = ?`,
    [name, avatarUrl, systemPrompt, baseModel, now, id]
  )

  const row = await query('SELECT * FROM agents WHERE id = ?').get<AgentRow>(id)
  if (!row) {
    throw createError({ statusCode: 500, message: 'Failed to update agent' })
  }
  return rowToAgent(row)
})
