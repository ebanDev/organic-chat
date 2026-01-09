import { query } from '../../database'

interface SearchResultRow {
  id: string
  conversation_id: string
  role: string
  content: string
  created_at: number
  title: string | null
}

export default defineEventHandler(async (event) => {
  const searchTerm = getQuery(event).q
  const q = typeof searchTerm === 'string' ? searchTerm.trim() : ''

  if (!q) {
    return []
  }

  const rows = await query(
    `SELECT messages.id,
            messages.conversation_id,
            messages.role,
            messages.content,
            messages.created_at,
            conversations.title
     FROM messages
     JOIN conversations ON conversations.id = messages.conversation_id
     WHERE messages.content LIKE ?
     ORDER BY messages.created_at DESC
     LIMIT 50`
  ).all<SearchResultRow>(`%${q}%`)

  return rows.map(row => ({
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as 'user' | 'assistant' | 'system',
    content: row.content,
    createdAt: row.created_at,
    title: row.title
  }))
})
