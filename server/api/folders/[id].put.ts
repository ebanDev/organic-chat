import { query, run } from '../../database'
import type { FolderRow } from '../../database/types'
import { rowToFolder } from '../../database/types'

interface UpdateFolderBody {
  name?: string
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Folder id is required' })
  }

  const body = await readBody<UpdateFolderBody>(event)
  const existing = await query('SELECT * FROM folders WHERE id = ?').get<FolderRow>(id)

  if (!existing) {
    throw createError({ statusCode: 404, message: 'Folder not found' })
  }

  const name = body.name === undefined ? existing.name : body.name?.trim()

  if (!name) {
    throw createError({ statusCode: 400, message: 'Folder name is required' })
  }

  const now = Date.now()

  await run(
    'UPDATE folders SET name = ?, updated_at = ? WHERE id = ?',
    [name, now, id]
  )

  const row = await query('SELECT * FROM folders WHERE id = ?').get<FolderRow>(id)
  if (!row) {
    throw createError({ statusCode: 500, message: 'Failed to update folder' })
  }

  return rowToFolder(row)
})
