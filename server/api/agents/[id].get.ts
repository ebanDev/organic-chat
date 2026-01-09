import { query } from '../../database'
import type { AgentRow } from '../../database/types'
import { rowToAgent } from '../../database/types'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!

  const row = await query('SELECT * FROM agents WHERE id = ?').get<AgentRow>(id)

  if (!row) {
    throw createError({ statusCode: 404, message: 'Agent not found' })
  }

  return rowToAgent(row)
})
