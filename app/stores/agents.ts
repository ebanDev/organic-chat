import type { Agent, AgentKnowledgeBase } from '~/types'

export const useAgentsStore = defineStore('agents', () => {
  const agents = ref<Agent[]>([])
  const activeId = ref<string | null>(null)
  const loading = ref(false)

  const active = computed(() =>
    agents.value.find(agent => agent.id === activeId.value) || null
  )

  async function load() {
    loading.value = true
    try {
      const rows = await $fetch<Agent[]>('/api/agents')
      if (rows?.length) {
        agents.value = rows
      }
    } catch {
      // Keep local cache when offline.
    } finally {
      loading.value = false
    }
  }

  async function create(data: { name: string, baseModel: string, systemPrompt: string, avatarUrl?: string }) {
    const now = Date.now()
    const agent: Agent = {
      id: crypto.randomUUID(),
      name: data.name.trim(),
      avatarUrl: data.avatarUrl?.trim() || null,
      systemPrompt: data.systemPrompt.trim(),
      baseModel: data.baseModel.trim(),
      createdAt: now,
      updatedAt: now
    }
    agents.value = [agent, ...agents.value]
    try {
      const saved = await $fetch<Agent>('/api/agents', {
        method: 'POST',
        body: agent
      })
      const index = agents.value.findIndex(item => item.id === agent.id)
      if (index !== -1) {
        agents.value.splice(index, 1, saved)
      }
      return saved
    } catch (error) {
      agents.value = agents.value.filter(item => item.id !== agent.id)
      throw error
    }
  }

  async function update(id: string, data: Partial<Pick<Agent, 'name' | 'baseModel' | 'systemPrompt' | 'avatarUrl'>>) {
    const existing = agents.value.find(a => a.id === id)
    if (!existing) throw new Error('Agent not found')
    const now = Date.now()
    const next: Agent = {
      ...existing,
      name: data.name?.trim() || existing.name,
      baseModel: data.baseModel?.trim() || existing.baseModel,
      systemPrompt: data.systemPrompt?.trim() || existing.systemPrompt,
      avatarUrl: data.avatarUrl === null ? null : (data.avatarUrl?.trim() || existing.avatarUrl),
      updatedAt: now
    }
    const index = agents.value.findIndex(a => a.id === id)
    if (index !== -1) {
      agents.value.splice(index, 1, next)
    }
    try {
      await $fetch(`/api/agents/${id}`, {
        method: 'PUT',
        body: {
          name: next.name,
          baseModel: next.baseModel,
          systemPrompt: next.systemPrompt,
          avatarUrl: next.avatarUrl
        }
      })
    } catch (error) {
      agents.value.splice(index, 1, existing)
      throw error
    }
    return next
  }

  async function remove(id: string) {
    const existing = agents.value.find(a => a.id === id)
    agents.value = agents.value.filter(a => a.id !== id)
    try {
      await $fetch(`/api/agents/${id}`, { method: 'DELETE' })
    } catch (error) {
      if (existing) {
        agents.value = [existing, ...agents.value]
      }
      throw error
    }
    if (activeId.value === id) {
      activeId.value = null
    }
  }

  function setActive(id: string | null) {
    activeId.value = id
  }

  async function loadKnowledgeBase(agentId: string) {
    return await $fetch<AgentKnowledgeBase[]>(`/api/agents/${agentId}/knowledge`)
  }

  async function addKnowledgeFile(agentId: string, filePath: string) {
    return await $fetch<AgentKnowledgeBase>(`/api/agents/${agentId}/knowledge`, {
      method: 'POST',
      body: { filePath }
    })
  }

  async function removeKnowledgeFile(agentId: string, kbId: string) {
    await $fetch(`/api/agents/${agentId}/knowledge/${kbId}`, {
      method: 'DELETE'
    })
  }

  return { agents, activeId, active, loading, load, create, update, remove, setActive, loadKnowledgeBase, addKnowledgeFile, removeKnowledgeFile }
}, {
  persist: true
})
