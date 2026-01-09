import type { Conversation, ConversationWithMessages, ToolPack } from '~/types'

export const useConversationsStore = defineStore('conversations', () => {
  const conversations = ref<Conversation[]>([])
  const activeId = ref<string | null>(null)
  const activeConversation = ref<ConversationWithMessages | null>(null)
  const loading = ref(false)
  const cachedConversations = ref<Record<string, ConversationWithMessages>>({})
  const pendingMessage = ref<string | null>(null)
  const pendingFiles = ref<FileList | null>(null)
  const pendingTools = ref<ToolPack[] | null>(null)
  const conversationTools = ref<Record<string, ToolPack[]>>({})
  let conversationLoadToken = 0

  const active = computed(() =>
    conversations.value.find(c => c.id === activeId.value) || null
  )

  async function refreshList() {
    try {
      const rows = await $fetch<Conversation[]>('/api/conversations')
      if (rows?.length) {
        conversations.value = rows
      }
    } catch {
      // Keep local cache when offline.
    }
  }

  async function load() {
    if (conversations.value.length) {
      loading.value = false
      void refreshList()
      return
    }
    loading.value = true
    try {
      await refreshList()
    } finally {
      loading.value = false
    }
  }

  async function refreshConversation(id: string, token: number) {
    const conversation = await $fetch<ConversationWithMessages>(`/api/conversations/${id}`)
    if (token !== conversationLoadToken || activeId.value !== id) return
    activeConversation.value = conversation
    cachedConversations.value = { ...cachedConversations.value, [id]: conversation }
  }

  async function loadConversation(id: string) {
    const token = conversationLoadToken + 1
    conversationLoadToken = token
    activeId.value = id
    const cached = cachedConversations.value[id]
    if (cached) {
      activeConversation.value = cached
      loading.value = false
      refreshConversation(id, token).catch(() => {
        // Keep cached conversation when offline.
      })
      return
    }
    activeConversation.value = null
    loading.value = true
    try {
      await refreshConversation(id, token)
    } catch {
      if (token === conversationLoadToken && activeId.value === id) {
        activeConversation.value = null
      }
    } finally {
      if (token === conversationLoadToken) {
        loading.value = false
      }
    }
  }

  async function create(data: { providerId?: string, agentId?: string, folderId?: string | null, model?: string, title?: string } = {}) {
    const now = Date.now()
    const conversation: Conversation = {
      id: crypto.randomUUID(),
      providerId: data.providerId || null,
      agentId: data.agentId || null,
      folderId: data.folderId || null,
      model: data.model || null,
      title: data.title || null,
      createdAt: now,
      updatedAt: now
    }
    conversations.value = [conversation, ...conversations.value]
    cachedConversations.value = { ...cachedConversations.value, [conversation.id]: { ...conversation, messages: [] } }
    try {
      const saved = await $fetch<Conversation>('/api/conversations', {
        method: 'POST',
        body: conversation
      })
      const index = conversations.value.findIndex(item => item.id === conversation.id)
      if (index !== -1) {
        conversations.value.splice(index, 1, saved)
      }
      cachedConversations.value = {
        ...cachedConversations.value,
        [conversation.id]: { ...(cachedConversations.value[conversation.id] ?? { messages: [] }), ...saved }
      }
      return saved
    } catch (error) {
      conversations.value = conversations.value.filter(item => item.id !== conversation.id)
      const { [conversation.id]: _removed, ...rest } = cachedConversations.value
      cachedConversations.value = rest
      throw error
    }
  }

  async function update(id: string, data: Partial<Pick<Conversation, 'providerId' | 'agentId' | 'folderId' | 'model' | 'title'>>) {
    const existing = conversations.value.find(c => c.id === id)
    if (!existing) throw new Error('Conversation not found')
    const now = Date.now()
    const next: Conversation = {
      ...existing,
      providerId: data.providerId === undefined ? existing.providerId : data.providerId,
      agentId: data.agentId === undefined ? existing.agentId : data.agentId,
      folderId: data.folderId === undefined ? existing.folderId : data.folderId,
      model: data.model === undefined ? existing.model : data.model,
      title: data.title === undefined ? existing.title : data.title,
      updatedAt: now
    }
    const index = conversations.value.findIndex(c => c.id === id)
    if (index !== -1) {
      conversations.value.splice(index, 1, next)
    }
    if (activeConversation.value?.id === id) {
      activeConversation.value = { ...activeConversation.value, ...next }
    }
    if (cachedConversations.value[id]) {
      cachedConversations.value = {
        ...cachedConversations.value,
        [id]: { ...cachedConversations.value[id], ...next }
      }
    }
    try {
      await $fetch(`/api/conversations/${id}`, {
        method: 'PUT',
        body: data
      })
    } catch (error) {
      if (index !== -1) {
        conversations.value.splice(index, 1, existing)
      }
      throw error
    }
    return next
  }

  async function remove(id: string) {
    const existing = conversations.value.find(c => c.id === id)
    conversations.value = conversations.value.filter(c => c.id !== id)
    const { [id]: _removed, ...rest } = cachedConversations.value
    cachedConversations.value = rest
    if (activeId.value === id) {
      activeId.value = null
      activeConversation.value = null
    }
    try {
      await $fetch(`/api/conversations/${id}`, { method: 'DELETE' })
    } catch (error) {
      if (existing) {
        conversations.value = [existing, ...conversations.value]
      }
      throw error
    }
  }

  function setActive(id: string | null) {
    activeId.value = id
    if (!id) {
      activeConversation.value = null
    }
  }

  function getTools(id: string, fallback: ToolPack[] = []) {
    return conversationTools.value[id] ?? fallback
  }

  function setTools(id: string, tools: ToolPack[]) {
    conversationTools.value = { ...conversationTools.value, [id]: tools }
  }

  function hasTools(id: string) {
    return Array.isArray(conversationTools.value[id])
  }

  return {
    conversations,
    activeId,
    active,
    activeConversation,
    cachedConversations,
    pendingMessage,
    pendingFiles,
    pendingTools,
    conversationTools,
    loading,
    load,
    loadConversation,
    create,
    update,
    remove,
    setActive,
    getTools,
    setTools,
    hasTools
  }
}, {
  persist: {
    pick: [
      'conversations',
      'activeId',
      'activeConversation',
      'cachedConversations',
      'conversationTools'
    ]
  }
})
