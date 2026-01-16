export function memoriesTableSql(tableName = 'memories'): string {
  return `
  CREATE TABLE IF NOT EXISTS ${tableName} (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    source TEXT NOT NULL DEFAULT '',
    embedding BLOB NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  `
}

export function memoriesIndexSql(tableName = 'memories', indexName = 'idx_memories_updated'): string {
  return `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(updated_at DESC);`
}

export const baseSchemaSql = `
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    base_url TEXT DEFAULT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    avatar_url TEXT DEFAULT NULL,
    system_prompt TEXT NOT NULL DEFAULT '',
    base_model TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY NOT NULL,
    provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
    agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    model TEXT DEFAULT NULL,
    title TEXT DEFAULT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS tools (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    api_key TEXT NOT NULL DEFAULT '',
    engine_id TEXT NOT NULL DEFAULT '',
    tavily_api_key TEXT NOT NULL DEFAULT '',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS memory_settings (
    id TEXT PRIMARY KEY NOT NULL,
    api_key TEXT NOT NULL DEFAULT '',
    embedding_model TEXT NOT NULL DEFAULT 'openai/text-embedding-3-small',
    embedding_dimensions INTEGER NOT NULL DEFAULT 1536,
    enabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );

  ${memoriesTableSql('memories')}

  CREATE TABLE IF NOT EXISTS agent_knowledge_base (
    id TEXT PRIMARY KEY NOT NULL,
    agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL DEFAULT ''
  );

  CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
  CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
  CREATE INDEX IF NOT EXISTS idx_tools_type_enabled ON tools(type, enabled);
  CREATE INDEX IF NOT EXISTS idx_agent_knowledge_agent ON agent_knowledge_base(agent_id);
  ${memoriesIndexSql('memories', 'idx_memories_updated')}
`

export const defaultMemorySettings = {
  id: 'default',
  apiKey: '',
  embeddingModel: 'openai/text-embedding-3-small',
  embeddingDimensions: 1536,
  enabled: 0
} as const
