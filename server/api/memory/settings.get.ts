import { getMemorySettings } from '../../utils/memory'

export default defineEventHandler(async () => {
  const settings = await getMemorySettings()
  if (!settings) {
    throw createError({ statusCode: 404, message: 'Memory settings not found' })
  }
  return settings
})
