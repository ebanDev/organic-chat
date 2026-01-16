import { run } from '../../../../database'

export default defineEventHandler(async (event) => {
  const agentId = getRouterParam(event, 'id')!
  const kbId = getRouterParam(event, 'kbId')!

  await run(
    'DELETE FROM agent_knowledge_base WHERE id = ? AND agent_id = ?',
    [kbId, agentId]
  )

  return { success: true }
})
