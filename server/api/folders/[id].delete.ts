import { run } from '../../database'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Folder id is required' })
  }

  await run('DELETE FROM folders WHERE id = ?', [id])
  return { ok: true }
})
