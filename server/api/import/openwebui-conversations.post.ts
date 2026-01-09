import { nanoid } from 'nanoid'
import { run } from '../../database'

interface UploadPart {
  name?: string
  filename?: string
  type?: string
  data?: Buffer
}

interface OpenWebUIMessage {
  role?: string
  content?: string
  timestamp?: number
}

interface OpenWebUIConversation {
  title?: string
  created_at?: number
  updated_at?: number
  chat?: {
    title?: string
    models?: string[]
    messages?: OpenWebUIMessage[]
    history?: {
      messages?: Record<string, OpenWebUIMessage>
    }
  }
}

function toMillis(value?: number): number {
  if (!value) return Date.now()
  return value < 1_000_000_000_000 ? value * 1000 : value
}

function isValidRole(role?: string): role is 'user' | 'assistant' | 'system' {
  return role === 'user' || role === 'assistant' || role === 'system'
}

function collectMessages(item: OpenWebUIConversation): OpenWebUIMessage[] {
  const direct = item.chat?.messages
  if (Array.isArray(direct) && direct.length) {
    return direct
  }

  const history = item.chat?.history?.messages ?? {}
  const values = Object.values(history)
  return values.sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0))
}

export default defineEventHandler(async (event) => {
  const parts = await readMultipartFormData(event)
  if (!parts?.length) {
    throw createError({ statusCode: 400, message: 'No file uploaded' })
  }

  const file = parts.find(part => (part as UploadPart).filename) as UploadPart | undefined
  if (!file?.data) {
    throw createError({ statusCode: 400, message: 'Invalid file upload' })
  }

  let payload: OpenWebUIConversation[]
  try {
    const raw = file.data.toString('utf-8')
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      throw new Error('Invalid JSON')
    }
    payload = parsed
  } catch {
    throw createError({ statusCode: 400, message: 'Invalid JSON file' })
  }

  let created = 0
  let skipped = 0

  for (const item of payload) {
    const messages = collectMessages(item)
      .filter(message => isValidRole(message.role) && message.content?.trim())

    if (!messages.length) {
      skipped += 1
      continue
    }

    const id = nanoid()
    const createdAt = toMillis(item.created_at ?? messages[0]?.timestamp)
    const updatedAt = toMillis(item.updated_at ?? messages[messages.length - 1]?.timestamp)
    const model = item.chat?.models?.[0] ?? null
    const title = item.title?.trim() || item.chat?.title?.trim() || null

    await run(
      `INSERT INTO conversations (id, provider_id, agent_id, model, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, null, null, model, title, createdAt, updatedAt]
    )

    for (const message of messages) {
      const content = message.content?.trim()
      if (!content || !isValidRole(message.role)) continue
      await run(
        `INSERT INTO messages (id, conversation_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [nanoid(), id, message.role, content, toMillis(message.timestamp)]
      )
    }

    created += 1
  }

  return { created, skipped }
})
