import { query, run } from '../../database'
import type { FolderRow } from '../../database/types'
import { rowToFolder } from '../../database/types'

interface CreateFolderBody {
  id?: string
  name: string
  createdAt?: number
  updatedAt?: number
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateFolderBody>(event)
  const name = body.name?.trim()

  if (!name) {
    throw createError({ statusCode: 400, message: 'Folder name is required' })
  }

  const now = Date.now()
  const id = body.id?.trim() || crypto.randomUUID()
  const createdAt = body.createdAt ?? now
  const updatedAt = body.updatedAt ?? now

  await run(
    `INSERT INTO folders (id, name, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    [id, name, createdAt, updatedAt]
  )

  const row = await query('SELECT * FROM folders WHERE id = ?').get<FolderRow>(id)
  if (!row) {
    throw createError({ statusCode: 500, message: 'Failed to create folder' })
  }
  return rowToFolder(row)
})
