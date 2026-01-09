import { exec, query, run, vectorEnabled } from '../../database'
import { memoriesIndexSql, memoriesTableSql } from '~~/shared/db/schema'
import type { MemorySettingsRow } from '../../database/types'
import { rowToMemorySettings } from '../../database/types'

interface UpdateMemorySettingsBody {
  apiKey?: string
  embeddingModel?: string
  embeddingDimensions?: number
  enabled?: boolean
}

export default defineEventHandler(async (event) => {
  const body = await readBody<UpdateMemorySettingsBody>(event)
  const existing = await query(
    `SELECT id, api_key, embedding_model, embedding_dimensions, enabled, created_at, updated_at
     FROM memory_settings
     WHERE id = ?`
  ).get<MemorySettingsRow>('default')
  if (!existing) {
    throw createError({ statusCode: 404, message: 'Memory settings not found' })
  }

  const apiKey = body.apiKey?.trim() ?? existing.api_key
  const embeddingModel = body.embeddingModel?.trim() ?? existing.embedding_model
  const embeddingDimensions = body.embeddingDimensions ?? existing.embedding_dimensions
  const enabled = body.enabled === undefined ? existing.enabled : (body.enabled ? 1 : 0)

  if (enabled && !apiKey) {
    throw createError({ statusCode: 400, message: 'OpenRouter API key is required to enable memory' })
  }
  if (!embeddingModel) {
    throw createError({ statusCode: 400, message: 'Embedding model is required' })
  }
  if (!Number.isFinite(embeddingDimensions) || embeddingDimensions <= 0) {
    throw createError({ statusCode: 400, message: 'Embedding dimensions must be a positive number' })
  }
  if (embeddingDimensions !== existing.embedding_dimensions) {
    if (!vectorEnabled) {
      throw createError({ statusCode: 500, message: 'sqlite-vector extension is not loaded' })
    }
    const countRow = await query('SELECT COUNT(*) as count FROM memories').get<{ count: number }>()
    const count = Number(countRow?.count ?? 0)
    if (count > 0) {
      throw createError({
        statusCode: 400,
        message: 'Delete existing memories before changing embedding dimensions'
      })
    }
    await exec(`
      DROP TABLE IF EXISTS memories;
      ${memoriesTableSql('memories')}
      ${memoriesIndexSql('memories', 'idx_memories_updated')}
      SELECT vector_init('memories', 'embedding', 'type=FLOAT32,dimension=${embeddingDimensions},distance=COSINE');
    `)
  }

  await run(
    `UPDATE memory_settings
     SET api_key = ?, embedding_model = ?, embedding_dimensions = ?, enabled = ?, updated_at = ?
     WHERE id = ?`,
    [apiKey, embeddingModel, embeddingDimensions, enabled, Date.now(), 'default']
  )

  const row = await query('SELECT * FROM memory_settings WHERE id = ?').get<MemorySettingsRow>('default')
  if (!row) {
    throw createError({ statusCode: 500, message: 'Failed to update memory settings' })
  }
  return rowToMemorySettings(row)
})
