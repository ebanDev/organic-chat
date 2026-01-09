import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { baseSchemaSql, defaultMemorySettings, memoriesIndexSql, memoriesTableSql } from '~~/shared/db/schema'

const db = new Database('server/db/chat.db', { create: true })

db.exec('PRAGMA journal_mode = WAL')
db.exec('PRAGMA foreign_keys = ON')
const cacheMb = Number(process.env.SQLITE_CACHE_MB ?? 500)
const cacheKb = Math.max(8, Math.floor(cacheMb * 1024))
db.exec(`PRAGMA cache_size = -${cacheKb}`)
db.exec(`PRAGMA mmap_size = ${cacheKb * 1024}`)

const vectorPath = process.env.SQLITE_VECTOR_PATH
const vectorEnabled = (() => {
  if (!vectorPath) return false
  try {
    db.loadExtension(vectorPath)
    return true
  } catch (error) {
    console.warn('[db] failed to load sqlite-vector extension', error)
    return false
  }
})()

db.exec(baseSchemaSql)

db.exec(`
  INSERT INTO app_settings (key, value)
    SELECT 'title_model', value FROM app_settings
      WHERE key = 'task_model'
        AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'title_model');
  INSERT INTO app_settings (key, value)
    SELECT 'memory_model', value FROM app_settings
      WHERE key = 'task_model'
        AND NOT EXISTS (SELECT 1 FROM app_settings WHERE key = 'memory_model');
`)

const query = (sql: string) => ({
  get: <T>(...args: SQLQueryBindings[]) => db.query(sql).get(...args) as T | null,
  all: <T>(...args: SQLQueryBindings[]) => db.query(sql).all(...args) as T[]
})

async function exec(sql: string) {
  db.exec(sql)
}

async function run(sql: string, args: SQLQueryBindings[] = []) {
  return db.query(sql).run(...args)
}

const providerColumns = query('PRAGMA table_info(providers)').all<{ name: string }>()
const hasProviderApiKey = providerColumns.some(column => column.name === 'api_key')
if (!hasProviderApiKey) {
  db.exec(`ALTER TABLE providers ADD COLUMN api_key TEXT NOT NULL DEFAULT ''`)
}

const hasProviderKeysTable = query(
  `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'provider_keys'`
).get<{ name: string }>()
if (hasProviderKeysTable) {
  db.exec(`
    UPDATE providers
      SET api_key = COALESCE((SELECT api_key FROM provider_keys WHERE provider_id = providers.id), api_key)
  `)
  db.exec('DROP TABLE provider_keys')
}

const toolColumns = query('PRAGMA table_info(tools)').all<{ name: string }>()
const hasToolApiKey = toolColumns.some(column => column.name === 'api_key')
const hasToolEngineId = toolColumns.some(column => column.name === 'engine_id')
const hasToolTavily = toolColumns.some(column => column.name === 'tavily_api_key')
if (!hasToolApiKey) {
  db.exec(`ALTER TABLE tools ADD COLUMN api_key TEXT NOT NULL DEFAULT ''`)
}
if (!hasToolEngineId) {
  db.exec(`ALTER TABLE tools ADD COLUMN engine_id TEXT NOT NULL DEFAULT ''`)
}
if (!hasToolTavily) {
  db.exec(`ALTER TABLE tools ADD COLUMN tavily_api_key TEXT NOT NULL DEFAULT ''`)
}

const hasToolKeysTable = query(
  `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tool_keys'`
).get<{ name: string }>()
if (hasToolKeysTable) {
  db.exec(`
    UPDATE tools
      SET api_key = COALESCE((SELECT api_key FROM tool_keys WHERE tool_id = tools.id), api_key),
          engine_id = COALESCE((SELECT engine_id FROM tool_keys WHERE tool_id = tools.id), engine_id),
          tavily_api_key = COALESCE((SELECT tavily_api_key FROM tool_keys WHERE tool_id = tools.id), tavily_api_key)
  `)
  db.exec('DROP TABLE tool_keys')
}

const memoryColumns = query('PRAGMA table_info(memories)').all<{ name: string }>()
const hasMemoryTags = memoryColumns.some(column => column.name === 'tags')
if (hasMemoryTags) {
  db.exec(`
    ${memoriesTableSql('memories_new')}
    INSERT INTO memories_new (id, title, content, source, embedding, created_at, updated_at)
      SELECT id, title, content, source, embedding, created_at, updated_at FROM memories;
    DROP TABLE memories;
    ALTER TABLE memories_new RENAME TO memories;
    ${memoriesIndexSql('memories', 'idx_memories_updated')}
  `)
}

const memorySettingsColumns = query('PRAGMA table_info(memory_settings)').all<{ name: string }>()
const hasMemoryApiKey = memorySettingsColumns.some(column => column.name === 'api_key')
if (!hasMemoryApiKey) {
  db.exec(`ALTER TABLE memory_settings ADD COLUMN api_key TEXT NOT NULL DEFAULT ''`)
}

const hasMemoryKeysTable = query(
  `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'memory_keys'`
).get<{ name: string }>()
if (hasMemoryKeysTable) {
  db.exec(`
    UPDATE memory_settings
      SET api_key = COALESCE((SELECT api_key FROM memory_keys WHERE id = memory_settings.id), api_key)
  `)
  db.exec('DROP TABLE memory_keys')
}

const hasMemorySettings = query('SELECT id FROM memory_settings LIMIT 1').get<{ id: string }>()
if (!hasMemorySettings) {
  const now = Date.now()
  db.query(
    `INSERT INTO memory_settings (id, api_key, embedding_model, embedding_dimensions, enabled, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    defaultMemorySettings.id,
    defaultMemorySettings.apiKey,
    defaultMemorySettings.embeddingModel,
    defaultMemorySettings.embeddingDimensions,
    defaultMemorySettings.enabled,
    now,
    now
  )
}

const memorySettings = query('SELECT embedding_dimensions FROM memory_settings WHERE id = ?').get<{ embedding_dimensions: number }>('default')
const dimensions = memorySettings?.embedding_dimensions ?? 1536
if (vectorEnabled) {
  try {
    db.exec(`SELECT vector_init('memories', 'embedding', 'type=FLOAT32,dimension=${dimensions},distance=COSINE')`)
    db.exec(`SELECT vector_quantize('memories', 'embedding')`)
  } catch (error) {
    console.warn('[db] vector_init failed', error)
  }
}

const warmupTables = [
  'providers',
  'agents',
  'folders',
  'conversations',
  'messages',
  'tools',
  'memory_settings',
  'memories',
  'app_settings'
]
try {
  const warmupStart = Date.now()
  for (const table of warmupTables) {
    db.query(`SELECT rowid FROM ${table}`).all()
  }
  console.info('[db] warm cache', { ms: Date.now() - warmupStart, tables: warmupTables.length })
} catch (error) {
  console.warn('[db] warm cache failed', error)
}

export { db, exec, query, run, vectorEnabled }
