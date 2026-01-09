import { query, run } from '../../database'
import type { MemoryRow } from '../../database/types'
import { updateMemoryEmbedding, getMemorySettings } from '../../utils/memory'

interface UpdateMemoryBody {
  title?: string
  content?: string
  source?: string
}

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Memory id is required' })
  }

  const body = await readBody<UpdateMemoryBody>(event)

  const existing = await query('SELECT * FROM memories WHERE id = ?').get<MemoryRow>(id)
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Memory not found' })
  }

  const title = body.title?.trim() ?? existing.title
  const content = body.content?.trim() ?? existing.content
  const source = body.source?.trim() ?? existing.source

  await run(
    `UPDATE memories
     SET title = ?, content = ?, source = ?, updated_at = ?
     WHERE id = ?`,
    [title, content, source, Date.now(), id]
  )

  if (content !== existing.content) {
    const settings = await getMemorySettings()
    if (!settings?.apiKey?.trim()) {
      throw createError({ statusCode: 400, message: 'OpenRouter API key is required to update memory content' })
    }
    await updateMemoryEmbedding(id, content, settings)
  }

  return { ok: true }
})
