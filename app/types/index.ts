export interface Provider {
  id: string
  name: string
  apiKey: string
  baseUrl: string | null
  createdAt: number
  updatedAt: number
}

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

export interface Folder {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type ToolPack = 'web_navigate'

export interface ConversationWithMessages extends Conversation {
  messages: Message[]
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
