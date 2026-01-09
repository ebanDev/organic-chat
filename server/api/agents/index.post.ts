import { query, run } from '../../database'
import type { AgentRow } from '../../database/types'
import { rowToAgent } from '../../database/types'

interface CreateAgentBody {
  id?: string
  name: string
  baseModel: string
  systemPrompt: string
  avatarUrl?: string
  createdAt?: number
  updatedAt?: number
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateAgentBody>(event)

  if (!body.name?.trim()) {
    throw createError({ statusCode: 400, message: 'Name is required' })
  }
  if (!body.baseModel?.trim()) {
    throw createError({ statusCode: 400, message: 'Base model is required' })
  }
  if (!body.systemPrompt?.trim()) {
    throw createError({ statusCode: 400, message: 'System prompt is required' })
  }

  const now = Date.now()
  const id = body.id?.trim() || crypto.randomUUID()
  const createdAt = body.createdAt ?? now
  const updatedAt = body.updatedAt ?? now
  const avatarUrl = body.avatarUrl?.trim() || null

  await run(
    `INSERT INTO agents (id, name, avatar_url, system_prompt, base_model, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, body.name.trim(), avatarUrl, body.systemPrompt.trim(), body.baseModel.trim(), createdAt, updatedAt]
  )

  const row = await query('SELECT * FROM agents WHERE id = ?').get<AgentRow>(id)
  if (!row) {
    throw createError({ statusCode: 500, message: 'Failed to create agent' })
  }
  return rowToAgent(row)
})
