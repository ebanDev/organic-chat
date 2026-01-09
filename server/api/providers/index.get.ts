import { query } from '../../database'
import type { ProviderRow } from '../../database/types'
import { rowToProvider } from '../../database/types'

export default defineEventHandler(async () => {
  const rows = await query('SELECT * FROM providers ORDER BY updated_at DESC').all<ProviderRow>()
  return rows.map(rowToProvider)
})
