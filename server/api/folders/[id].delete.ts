import { run } from '../../database'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, message: 'Folder id is required' })
  }

  const query = getQuery(event)
  const action = typeof query.action === 'string' ? query.action : 'keep_chats'

  if (action === 'delete_chats') {
    await run('DELETE FROM conversations WHERE folder_id = ?', [id])
  }

  await run('DELETE FROM folders WHERE id = ?', [id])
  return { ok: true }
})
