import { insertMemories, getMemorySettings } from '../../utils/memory'

interface CreateMemoryBody {
  title: string
  content: string
  source?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<CreateMemoryBody>(event)

  if (!body.title?.trim()) {
    throw createError({ statusCode: 400, message: 'Title is required' })
  }
  if (!body.content?.trim()) {
    throw createError({ statusCode: 400, message: 'Content is required' })
  }

  const settings = await getMemorySettings()
  if (!settings) {
    throw createError({ statusCode: 500, message: 'Memory settings missing' })
  }
  if (!settings.apiKey?.trim()) {
    throw createError({ statusCode: 400, message: 'OpenRouter API key is required' })
  }

  await insertMemories([{
    title: body.title,
    content: body.content,
    source: body.source
  }], settings)

  return { ok: true }
})
