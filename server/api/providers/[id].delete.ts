import { run } from '../../database'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Provider id is required' })
  }

  await run('DELETE FROM providers WHERE id = ?', [id])
  return { ok: true }
})
