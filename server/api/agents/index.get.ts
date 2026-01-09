import { query } from '../../database'
import type { AgentRow } from '../../database/types'
import { rowToAgent } from '../../database/types'

export default defineEventHandler(async () => {
  const rows = await query('SELECT * FROM agents ORDER BY updated_at DESC').all<AgentRow>()
  return rows.map(rowToAgent)
})
