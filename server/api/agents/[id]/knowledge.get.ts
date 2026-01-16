import { query } from '../../../database'
import type { AgentKnowledgeBaseRow } from '../../../database/types'
import { rowToAgentKnowledgeBase } from '../../../database/types'

export default defineEventHandler(async (event) => {
  const agentId = getRouterParam(event, 'id')!

  const rows = await query(
    'SELECT * FROM agent_knowledge_base WHERE agent_id = ? ORDER BY created_at DESC'
  ).all<AgentKnowledgeBaseRow>(agentId)

  return rows.map(rowToAgentKnowledgeBase)
})
