export interface Conversation {
  id: string
  providerId: string | null
  agentId: string | null
  folderId: string | null
  model: string | null
  title: string | null
  createdAt: number
  updatedAt: number
}

export interface Message {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
}

export interface Agent {
  id: string
  name: string
  avatarUrl: string | null
  systemPrompt: string
  baseModel: string
  createdAt: number
  updatedAt: number
}

export interface Folder {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export interface MemorySettings {
  id: string
  apiKey: string
  embeddingModel: string
  embeddingDimensions: number
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface Memory {
  id: string
  title: string
  content: string
  source: string
  createdAt: number
  updatedAt: number
}

export interface Provider {
  id: string
  name: string
  apiKey: string
  baseUrl: string | null
  createdAt: number
  updatedAt: number
}

export interface Tool {
  id: string
  type: 'web_navigate'
  name: string
  apiKey: string
  engineId: string
  tavilyApiKey: string
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface ProviderRow {
  id: string
  name: string
  api_key: string
  base_url: string | null
  created_at: number
  updated_at: number
}

export interface AgentRow {
  id: string
  name: string
  avatar_url: string | null
  system_prompt: string
  base_model: string
  created_at: number
  updated_at: number
}

export interface ConversationRow {
  id: string
  provider_id: string | null
  agent_id: string | null
  folder_id: string | null
  model: string | null
  title: string | null
  created_at: number
  updated_at: number
}

export interface MessageRow {
  id: string
  conversation_id: string
  role: string
  content: string
  created_at: number
}

export interface ToolRow {
  id: string
  type: 'web_navigate'
  name: string
  api_key: string
  engine_id: string
  tavily_api_key: string
  enabled: number
  created_at: number
  updated_at: number
}

export interface FolderRow {
  id: string
  name: string
  created_at: number
  updated_at: number
}

export interface MemorySettingsRow {
  id: string
  api_key: string
  embedding_model: string
  embedding_dimensions: number
  enabled: number
  created_at: number
  updated_at: number
}

export interface MemoryRow {
  id: string
  title: string
  content: string
  source: string
  created_at: number
  updated_at: number
}

export function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    providerId: row.provider_id,
    agentId: row.agent_id,
    folderId: row.folder_id,
    model: row.model,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function rowToFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function rowToMemorySettings(row: MemorySettingsRow): MemorySettings {
  return {
    id: row.id,
    apiKey: row.api_key,
    embeddingModel: row.embedding_model,
    embeddingDimensions: row.embedding_dimensions,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function rowToAgent(row: AgentRow): Agent {
  return {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatar_url,
    systemPrompt: row.system_prompt,
    baseModel: row.base_model,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function rowToMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role as Message['role'],
    content: row.content,
    createdAt: row.created_at
  }
}

export function rowToMemory(row: MemoryRow): Memory {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function rowToProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    name: row.name,
    apiKey: row.api_key,
    baseUrl: row.base_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function rowToTool(row: ToolRow): Tool {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    apiKey: row.api_key,
    engineId: row.engine_id,
    tavilyApiKey: row.tavily_api_key,
    enabled: Boolean(row.enabled),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}
