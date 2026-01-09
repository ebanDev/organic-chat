import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { query } from '../../database'
import { resolveProviderBaseUrl, openAIStreamFilterFetch } from '../../utils/provider'
import type { ProviderRow } from '../../database/types'

const bodySchema = z.object({
  prompt: z.string().trim().min(1),
  providerId: z.string().trim().min(1),
  model: z.string().trim().min(1).optional()
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = bodySchema.safeParse(body)

  if (!parsed.success) {
    throw createError({ statusCode: 400, message: 'Invalid request body' })
  }

  const { prompt, providerId, model } = parsed.data

  const provider = await query(
    'SELECT * FROM providers WHERE id = ?'
  ).get<ProviderRow>(providerId)

  if (!provider) {
    throw createError({ statusCode: 404, message: 'Provider not found' })
  }

  if (!provider.api_key?.trim()) {
    throw createError({ statusCode: 400, message: 'Provider has no API key configured' })
  }

  const baseUrl = resolveProviderBaseUrl(provider.base_url)
  const openai = createOpenAI({
    apiKey: provider.api_key,
    baseURL: baseUrl,
    fetch: openAIStreamFilterFetch
  })

  try {
    const result = await streamText({
      model: openai.chat(model || 'gpt-4o'),
      messages: [{ role: 'user', content: prompt }]
    })

    const text = await result.text

    return { text: text ?? '' }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw createError({ statusCode: 502, message: `Provider error: ${message}` })
  }
})
