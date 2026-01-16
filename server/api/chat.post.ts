import { Output, streamText, convertToModelMessages, generateText, stepCountIs, createUIMessageStream, createUIMessageStreamResponse, smoothStream, type UIMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { nanoid } from 'nanoid'
import { query, run } from '../database'
import { resolveProviderBaseUrl, openAIStreamFilterFetch } from '../utils/provider'
import { getMemoryPrompt, getTitlePrompt } from '../utils/prompts'
import { createWebTools } from '../tools/web-tools'
import { formatMemoryContext, getMemorySettings, insertMemories, searchMemories } from '../utils/memory'
import { loadAgentKnowledgeBase, formatKnowledgeBaseContext } from '../utils/knowledge'
import type { AgentRow, ProviderRow, ConversationRow, ToolRow } from '../database/types'
import { z } from 'zod'

interface ChatBody {
  conversationId: string
  messages: UIMessage[]
  titleModel?: string | null
  memoryModel?: string | null
  taskModel?: string | null
  timeZone?: string | null
  tools?: string[] | null
}

function formatCurrentDatetime(timeZone?: string | null): string {
  const now = new Date()
  const requested = timeZone?.trim()
  if (requested) {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: requested,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZoneName: 'short'
      }).format(now)
    } catch {
      // Fall back to server time if the client time zone is invalid.
    }
  }
  return now.toISOString()
}

function applyPromptVariables(prompt: string, timeZone?: string | null): string {
  if (!prompt.includes('{{CURRENT_DATETIME}}')) return prompt
  const current = formatCurrentDatetime(timeZone)
  return prompt.replaceAll('{{CURRENT_DATETIME}}', current)
}

export default defineEventHandler(async (event) => {
  console.info('[chat] incoming request', { path: event.path })
  const body = await readBody<ChatBody>(event)
  let memoryNoticeSent = false
  let memoryNoticePayload: { title: string, content: string } | null = null
  let uiWriter: Parameters<Parameters<typeof createUIMessageStream<UIMessage>>[0]['execute']>[0]['writer'] | null = null
  if (!body.conversationId) {
    console.warn('[chat] missing conversationId')
    throw createError({ statusCode: 400, message: 'conversationId is required' })
  }

  if (!body.messages?.length) {
    console.warn('[chat] missing messages', { conversationId: body.conversationId })
    throw createError({ statusCode: 400, message: 'messages are required' })
  }

  const conversation = await query(
    'SELECT * FROM conversations WHERE id = ?'
  ).get<ConversationRow>(body.conversationId)

  if (!conversation) {
    console.warn('[chat] conversation not found', { conversationId: body.conversationId })
    throw createError({ statusCode: 404, message: 'Conversation not found' })
  }

  if (!conversation.provider_id) {
    console.warn('[chat] conversation missing provider', { conversationId: body.conversationId })
    throw createError({ statusCode: 400, message: 'Conversation has no provider configured' })
  }

  const provider = await query(
    'SELECT * FROM providers WHERE id = ?'
  ).get<ProviderRow>(conversation.provider_id)

  if (!provider) {
    console.warn('[chat] provider not found', { providerId: conversation.provider_id })
    throw createError({ statusCode: 400, message: 'Provider not found' })
  }
  if (!provider.api_key?.trim()) {
    console.warn('[chat] provider missing api key', { providerId: provider.id })
    throw createError({ statusCode: 400, message: 'Provider has no API key configured' })
  }

  const agent = conversation.agent_id
    ? (await query('SELECT * FROM agents WHERE id = ?').get<AgentRow>(conversation.agent_id))
    : null

  const webEnabled = Array.isArray(body.tools) && body.tools.includes('web_navigate')
  const webTool = webEnabled
    ? (await query(
        `SELECT * FROM tools WHERE type = ? AND enabled = 1 LIMIT 1`
      ).get<ToolRow>('web_navigate'))
    : null
  const webTools = webTool
    ? createWebTools({ google: webTool, tavily: webTool })
    : undefined

  const model = conversation.model || agent?.base_model || 'gpt-4o'
  if (conversation.model !== model) {
    await run(
      'UPDATE conversations SET model = ?, updated_at = ? WHERE id = ?',
      [model, Date.now(), body.conversationId]
    )
  }
  const baseUrl = resolveProviderBaseUrl(provider.base_url)
  console.info('[chat] resolved provider', {
    conversationId: body.conversationId,
    providerId: provider.id,
    baseUrl,
    model
  })

  const openai = createOpenAI({
    apiKey: provider.api_key,
    baseURL: baseUrl,
    fetch: openAIStreamFilterFetch
  })

  const lastUserMessage = body.messages[body.messages.length - 1]
  let lastUserText = ''
  if (lastUserMessage?.role === 'user') {
    const textPart = lastUserMessage.parts.find(part => part.type === 'text')
    if (textPart && 'text' in textPart && textPart.text) {
      lastUserText = textPart.text
      const messageId = lastUserMessage.id || nanoid()
      const existingMsg = await query(
        'SELECT id FROM messages WHERE id = ?'
      ).get<{ id: string }>(messageId)

      if (!existingMsg) {
        await run(
          'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
          [messageId, body.conversationId, 'user', textPart.text, Date.now()]
        )
      }
    }
  }

  const systemPromptRaw = agent?.system_prompt?.trim()
  const systemPrompt = systemPromptRaw
    ? applyPromptVariables(systemPromptRaw, body.timeZone)
    : ''

  const knowledgeBaseContext = agent?.id
    ? formatKnowledgeBaseContext(await loadAgentKnowledgeBase(agent.id).catch((error) => {
        console.warn('[chat] knowledge base load failed', {
          conversationId: body.conversationId,
          agentId: agent.id,
          message: error instanceof Error ? error.message : String(error)
        })
        return []
      }))
    : ''

  const memorySettingsStart = Date.now()
  const memorySettings = await getMemorySettings()
  console.info('[memory] settings load', { ms: Date.now() - memorySettingsStart })
  const memoryEnabled = Boolean(memorySettings?.enabled)
  const memoryContext = memoryEnabled && memorySettings && lastUserText
    ? formatMemoryContext(await searchMemories(lastUserText, memorySettings).catch((error) => {
        console.warn('[chat] memory search failed', {
          conversationId: body.conversationId,
          message: error instanceof Error ? error.message : String(error)
        })
        return []
      }))
    : ''

  const systemMessages: Omit<UIMessage, 'id'>[] = []
  if (systemPrompt) {
    systemMessages.push({
      role: 'system',
      parts: [{ type: 'text', text: systemPrompt }]
    })
  }
  if (knowledgeBaseContext) {
    systemMessages.push({
      role: 'system',
      parts: [{ type: 'text', text: knowledgeBaseContext }]
    })
  }
  if (memoryContext) {
    systemMessages.push({
      role: 'system',
      parts: [{ type: 'text', text: memoryContext }]
    })
  }
  const modelMessages: Omit<UIMessage, 'id'>[] = [
    ...systemMessages,
    ...body.messages.map(({ id, ...rest }) => rest)
  ]

  try {
    const streamStart = Date.now()
    let firstTokenLogged = false
    const result = streamText({
      model: openai.chat(model),
      messages: await convertToModelMessages(modelMessages),
      stopWhen: webTools ? stepCountIs(50) : undefined,
      tools: webTools,
      experimental_transform: smoothStream({ chunking: 'word' }),
      onChunk: ({ chunk }) => {
        if (!firstTokenLogged && (chunk.type === 'reasoning-delta' || chunk.type === 'text-delta')) {
          firstTokenLogged = true
          console.info('[chat] first token', { ms: Date.now() - streamStart })
        }
      },
      onFinish: async ({ text }) => {
        if (text?.trim()) {
          await run(
            'INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)',
            [nanoid(), body.conversationId, 'assistant', text, Date.now()]
          )
        }

        await run(
          'UPDATE conversations SET updated_at = ? WHERE id = ?',
          [Date.now(), body.conversationId]
        )

        if (memoryEnabled && memorySettings && lastUserText && text?.trim()) {
          try {
            const memorySchema = z.object({
              shouldStore: z.boolean(),
              memories: z.array(z.object({
                title: z.string(),
                content: z.string(),
                source: z.string().optional()
              }))
            })
            const prompt = await getMemoryPrompt()
            const extractionModel = body.memoryModel || body.taskModel || model
            const extractionStart = Date.now()
            const { output } = await generateText({
              model: openai.chat(extractionModel),
              system: prompt,
              messages: [
                {
                  role: 'user',
                  content: `User: ${lastUserText}\nAssistant: ${text}`
                }
              ],
              output: Output.object({ schema: memorySchema })
            })
            console.info('[memory] extraction', { ms: Date.now() - extractionStart })
            const parsed = memorySchema.safeParse(output)
            if (parsed.success && parsed.data.shouldStore) {
              const memories = parsed.data.memories.slice(0, 5).map(item => ({
                title: item.title,
                content: item.content,
                source: item.source ?? `conversation:${body.conversationId}`
              }))
              await insertMemories(memories, memorySettings)
              const first = memories[0]
              if (first) {
                memoryNoticePayload = {
                  title: first.title,
                  content: first.content
                }
              }
              if (memoryNoticePayload && uiWriter && !memoryNoticeSent) {
                memoryNoticeSent = true
                uiWriter.write({ type: 'data-memory', data: { memorySaved: memoryNoticePayload } })
              }
            }
          } catch (error) {
            console.warn('[chat] memory extraction failed', {
              conversationId: body.conversationId,
              message: error instanceof Error ? error.message : String(error)
            })
          }
        }

        if (!conversation.title && text) {
          let title = text.slice(0, 50) + (text.length > 50 ? '...' : '')

          const titleModel = body.titleModel || body.taskModel
          if (titleModel) {
            try {
              const prompt = await getTitlePrompt()
              const titleResult = await generateText({
                model: openai.chat(titleModel),
                system: prompt,
                messages: [
                  {
                    role: 'user',
                    content: `User: ${lastUserText}\nAssistant: ${text}`
                  }
                ]
              })
              if (titleResult.text?.trim()) {
                title = titleResult.text.trim().slice(0, 80)
              }
            } catch (error) {
              console.warn('[chat] title generation failed', {
                conversationId: body.conversationId,
                titleModel,
                message: error instanceof Error ? error.message : String(error)
              })
            }
          }
          await run(
            'UPDATE conversations SET title = ? WHERE id = ?',
            [title, body.conversationId]
          )
        }
      }
    })

    const stream = createUIMessageStream<UIMessage>({
      execute: ({ writer }) => {
        uiWriter = writer
        if (memoryNoticePayload && !memoryNoticeSent && uiWriter) {
          memoryNoticeSent = true
          uiWriter.write({ type: 'data-memory', data: { memorySaved: memoryNoticePayload } })
        }
        const uiStream = result.toUIMessageStream({
          messageMetadata: ({ part }) => {
            if (part.type === 'start') {
              return { xModel: model }
            }
          }
        })

        writer.merge(uiStream)
      }
    })

    return createUIMessageStreamResponse({ stream })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('[chat] provider error', {
      conversationId: body.conversationId,
      providerId: provider.id,
      baseUrl,
      model,
      message
    })
    throw createError({
      statusCode: 502,
      message: `Provider error: ${message}`
    })
  }
})
