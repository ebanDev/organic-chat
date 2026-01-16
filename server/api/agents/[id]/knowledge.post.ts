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
  const filePath = body.filePath.trim()

  await run(
    'INSERT INTO agent_knowledge_base (id, agent_id, file_path, created_at) VALUES (?, ?, ?, ?)',
    [id, agentId, filePath, now]
  )

  return rowToAgentKnowledgeBase({
    id,
    agent_id: agentId,
    file_path: filePath,
    created_at: now
  })
})
