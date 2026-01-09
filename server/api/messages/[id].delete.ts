import { query, run } from '../../database'
import type { MessageRow } from '../../database/types'

export default defineEventHandler(async (event) => {
  const id = event.context.params?.id
  if (!id) {
    throw createError({ statusCode: 400, message: 'Message id is required' })
  }

  const message = await query('SELECT * FROM messages WHERE id = ?').get<MessageRow>(id)
  if (!message) {
    throw createError({ statusCode: 404, message: 'Message not found' })
  }

  if (message.role !== 'user') {
    throw createError({ statusCode: 400, message: 'Only user messages can be edited' })
  }

  await run(
    'DELETE FROM messages WHERE conversation_id = ? AND created_at >= ?',
    [message.conversation_id, message.created_at]
  )

  await run(
    'UPDATE conversations SET updated_at = ? WHERE id = ?',
    [Date.now(), message.conversation_id]
  )
  return { ok: true, conversationId: message.conversation_id }
})
