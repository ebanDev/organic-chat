import { run } from '../../database'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  await run('DELETE FROM agents WHERE id = ?', [id])
  return { success: true }
})
