import { query } from '../../database'
import type { MemoryRow } from '../../database/types'
import { rowToMemory } from '../../database/types'

export default defineEventHandler(async () => {
  const rows = await query(
    'SELECT id, title, content, source, created_at, updated_at FROM memories ORDER BY updated_at DESC'
  ).all<MemoryRow>()
  return rows.map(rowToMemory)
})
