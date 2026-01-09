import { run } from '../../database'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Memory id is required' })
  }

  await run('DELETE FROM memories WHERE id = ?', [id])
  return { ok: true }
})
