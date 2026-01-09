import { query } from '../../database'
import type { FolderRow } from '../../database/types'
import { rowToFolder } from '../../database/types'

export default defineEventHandler(async () => {
  const rows = await query('SELECT * FROM folders ORDER BY updated_at DESC').all<FolderRow>()
  return rows.map(rowToFolder)
})
