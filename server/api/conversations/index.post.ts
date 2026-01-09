import { query, run } from '../../database'
import type { ConversationRow } from '../../database/types'
import { rowToConversation } from '../../database/types'

interface CreateConversationBody {
  id?: string
  providerId?: string
  agentId?: string
  folderId?: string | null
  model?: string
  title?: string
  createdAt?: number
  updatedAt?: number
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateConversationBody>(event)

  const now = Date.now()
  const id = body.id?.trim() || crypto.randomUUID()
  const createdAt = body.createdAt ?? now
  const updatedAt = body.updatedAt ?? now

  await run(
    `INSERT INTO conversations (id, provider_id, agent_id, folder_id, model, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      body.providerId || null,
      body.agentId || null,
      body.folderId || null,
      body.model || null,
      body.title || null,
      createdAt,
      updatedAt
    ]
  )

  const row = await query('SELECT * FROM conversations WHERE id = ?').get<ConversationRow>(id)
  if (!row) {
    throw createError({ statusCode: 500, message: 'Failed to create conversation' })
  }
  return rowToConversation(row)
})
