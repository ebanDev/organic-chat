import { query } from '../../database'
import type { ToolRow } from '../../database/types'
import { rowToTool } from '../../database/types'

export default defineEventHandler(async () => {
  const rows = await query('SELECT * FROM tools ORDER BY updated_at DESC').all<ToolRow>()
  return rows.map(rowToTool)
})
