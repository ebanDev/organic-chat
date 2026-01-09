import { query } from '../../database'
import type { ConversationRow } from '../../database/types'
import { rowToConversation } from '../../database/types'

export default defineEventHandler(async () => {
  const rows = await query('SELECT * FROM conversations ORDER BY updated_at DESC').all<ConversationRow>()
  return rows.map(rowToConversation)
})
