import { query } from '../../database'
import type { ConversationRow, MessageRow } from '../../database/types'
import { rowToConversation, rowToMessage } from '../../database/types'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!

  const row = await query('SELECT * FROM conversations WHERE id = ?').get<ConversationRow>(id)

  if (!row) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  const messageRows = await query(
    'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC'
  ).all<MessageRow>(id)

  return {
    ...rowToConversation(row),
    messages: messageRows.map(rowToMessage)
  }
})
