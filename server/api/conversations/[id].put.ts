import { query, run } from '../../database'
import type { ConversationRow } from '../../database/types'
import { rowToConversation } from '../../database/types'

interface UpdateConversationBody {
  providerId?: string | null
  agentId?: string | null
  folderId?: string | null
  model?: string | null
  title?: string | null
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const body = await readBody<UpdateConversationBody>(event)

  const existing = await query('SELECT * FROM conversations WHERE id = ?').get<ConversationRow>(id)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  const providerId = body.providerId === null ? null : (body.providerId || existing.provider_id)
  const agentId = body.agentId === null ? null : (body.agentId || existing.agent_id)
  const folderId = body.folderId === null ? null : (body.folderId || existing.folder_id)
  const model = body.model === null ? null : (body.model || existing.model)
  const title = body.title === null ? null : (body.title || existing.title)
  const now = Date.now()

  await run(
    `UPDATE conversations SET provider_id = ?, agent_id = ?, folder_id = ?, model = ?, title = ?, updated_at = ? WHERE id = ?`,
    [providerId, agentId, folderId, model, title, now, id]
  )

  const row = await query('SELECT * FROM conversations WHERE id = ?').get<ConversationRow>(id)
  if (!row) {
    throw createError({ statusCode: 500, message: 'Failed to update conversation' })
  }
  return rowToConversation(row)
})
