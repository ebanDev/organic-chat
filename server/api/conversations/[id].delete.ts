import { run } from '../../database'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!

  const result = await run('DELETE FROM conversations WHERE id = ?', [id])

  if (!result.changes) {
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  return { success: true }
})
