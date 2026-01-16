import { query, run } from '../../../database'
import type { AgentKnowledgeBaseRow } from '../../../database/types'
import { rowToAgentKnowledgeBase } from '../../../database/types'

interface AddKnowledgeBody {
  filePath: string
}

export default defineEventHandler(async (event) => {
  const agentId = getRouterParam(event, 'id')!
  const body = await readBody<AddKnowledgeBody>(event)

  if (!body.filePath?.trim()) {
    throw createError({ statusCode: 400, message: 'File path is required' })
  }

  const existing = await query(
    'SELECT * FROM agent_knowledge_base WHERE agent_id = ? AND file_path = ?'
  ).get<AgentKnowledgeBaseRow>(agentId, body.filePath.trim())

  if (existing) {
    throw createError({ statusCode: 409, message: 'File already attached to agent' })
  }

  const id = crypto.randomUUID()
  const now = Date.now()

  await run(
    'INSERT INTO agent_knowledge_base (id, agent_id, file_path, created_at) VALUES (?, ?, ?, ?)',
    [id, agentId, body.filePath.trim(), now]
  )

  const row = await query('SELECT * FROM agent_knowledge_base WHERE id = ?').get<AgentKnowledgeBaseRow>(id)
  if (!row) {
    throw createError({ statusCode: 500, message: 'Failed to attach file' })
  }

  return rowToAgentKnowledgeBase(row)
})
