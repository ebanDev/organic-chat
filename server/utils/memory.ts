import { exec, query, run, vectorEnabled } from '../database'
import type { Memory, MemoryRow, MemorySettings, MemorySettingsRow } from '../database/types'
import { rowToMemory, rowToMemorySettings } from '../database/types'

interface EmbedResponse {
  data?: Array<{ embedding?: number[] }>
}

export interface MemoryCandidate {
  title: string
  content: string
  source?: string
}

export async function getMemorySettings(): Promise<MemorySettings | null> {
  const row = await query(
    `SELECT id, api_key, embedding_model, embedding_dimensions, enabled, created_at, updated_at
     FROM memory_settings
     WHERE id = ?`
  ).get<MemorySettingsRow>('default')
  return row ? rowToMemorySettings(row) : null
}

export function formatMemoryContext(memories: Memory[]): string {
  if (!memories.length) return ''
  const lines = memories.map((memory) => {
    const title = memory.title.trim()
    const content = memory.content.trim()
    return `- ${title}: ${content}`
  })
  return `Relevant memory:\n${lines.join('\n')}`
}

export async function embedTexts(texts: string[], settings: MemorySettings, label = 'embed'): Promise<number[][]> {
  if (!settings.apiKey?.trim()) {
    throw new Error('OpenRouter API key is required for embeddings')
  }
  const start = Date.now()
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: settings.embeddingModel,
      input: texts
    })
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'Failed to generate embeddings')
  }

  const payload = (await response.json()) as EmbedResponse
  const embeddings = payload.data?.map(item => item.embedding).filter(Boolean) as number[][] | undefined
  if (!embeddings || embeddings.length !== texts.length) {
    throw new Error('Invalid embeddings response')
  }
  const expected = settings.embeddingDimensions
  if (expected > 0 && embeddings.some(vector => vector.length !== expected)) {
    throw new Error('Embedding dimensions mismatch')
  }
  console.info(`[memory] ${label} embeddings`, { count: texts.length, ms: Date.now() - start })
  return embeddings
}

export async function searchMemories(queryText: string, settings: MemorySettings, limit = 5): Promise<Memory[]> {
  if (!vectorEnabled) {
    throw new Error('sqlite-vector extension is not loaded')
  }
  if (!queryText.trim()) return []
  const [vector] = await embedTexts([queryText], settings, 'search')
  if (!vector) return []
  const start = Date.now()
  const rows = await query(
    `SELECT m.id, m.title, m.content, m.source, m.created_at, m.updated_at
     FROM memories m
     JOIN vector_quantize_scan('memories', 'embedding', vector_as_f32(?), ?) v
       ON m.rowid = v.rowid
     ORDER BY v.distance ASC`
  ).all<MemoryRow>(JSON.stringify(vector), limit)
  console.info('[memory] vector search', { ms: Date.now() - start, count: rows.length })
  return rows.map(rowToMemory)
}

export async function insertMemories(memories: MemoryCandidate[], settings: MemorySettings): Promise<void> {
  if (!vectorEnabled) {
    throw new Error('sqlite-vector extension is not loaded')
  }
  if (!memories.length) return
  const cleaned = memories.map(memory => ({
    title: memory.title.trim(),
    content: memory.content.trim(),
    source: memory.source?.trim() || ''
  })).filter(memory => memory.title && memory.content)

  if (!cleaned.length) return
  const vectors = await embedTexts(cleaned.map(item => item.content), settings, 'insert')
  const now = Date.now()

  await Promise.all(cleaned.map(async (memory, index) => {
    const vector = vectors[index]
    if (!vector) return
    await run(
      `INSERT INTO memories (id, title, content, source, embedding, created_at, updated_at)
       VALUES (?, ?, ?, ?, vector_as_f32(?), ?, ?)`,
      [
        crypto.randomUUID(),
        memory.title,
        memory.content,
        memory.source,
        JSON.stringify(vector),
        now,
        now
      ]
    )
  }))
  await exec(`SELECT vector_quantize('memories', 'embedding')`)
}

export async function updateMemoryEmbedding(
  id: string,
  content: string,
  settings: MemorySettings
): Promise<void> {
  if (!vectorEnabled) {
    throw new Error('sqlite-vector extension is not loaded')
  }
  const [vector] = await embedTexts([content], settings, 'update')
  if (!vector) return
  await run(
    `UPDATE memories SET embedding = vector_as_f32(?), updated_at = ? WHERE id = ?`,
    [JSON.stringify(vector), Date.now(), id]
  )
  await exec(`SELECT vector_quantize('memories', 'embedding')`)
}
