import type { Tool } from '~/types'

export const useToolsStore = defineStore('tools', () => {
  const tools = ref<Tool[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const rows = await $fetch<Tool[]>('/api/tools')
      if (rows?.length) {
        tools.value = rows
      }
    } catch {
      // Keep local cache when offline.
    } finally {
      loading.value = false
    }
  }

  async function create(data: { type: Tool['type'], name: string, apiKey: string, engineId: string, tavilyApiKey: string, enabled?: boolean }) {
    const now = Date.now()
    const tool: Tool = {
      id: crypto.randomUUID(),
      type: data.type,
      name: data.name.trim(),
      apiKey: data.apiKey.trim(),
      engineId: data.engineId.trim(),
      tavilyApiKey: data.tavilyApiKey.trim(),
      enabled: data.enabled !== false,
      createdAt: now,
      updatedAt: now
    }
    tools.value = [tool, ...tools.value]
    try {
      const saved = await $fetch<Tool>('/api/tools', {
        method: 'POST',
        body: tool
      })
      const index = tools.value.findIndex(item => item.id === tool.id)
      if (index !== -1) {
        tools.value.splice(index, 1, saved)
      }
      return saved
    } catch (error) {
      tools.value = tools.value.filter(item => item.id !== tool.id)
      throw error
    }
  }

  async function update(id: string, data: Partial<Pick<Tool, 'name' | 'apiKey' | 'engineId' | 'tavilyApiKey' | 'enabled'>>) {
    const existing = tools.value.find(t => t.id === id)
    if (!existing) {
      throw new Error('Tool not found')
    }
    const now = Date.now()
    const next: Tool = {
      ...existing,
      name: data.name?.trim() || existing.name,
      apiKey: data.apiKey?.trim() ?? existing.apiKey,
      engineId: data.engineId?.trim() ?? existing.engineId,
      tavilyApiKey: data.tavilyApiKey?.trim() ?? existing.tavilyApiKey,
      enabled: data.enabled === undefined ? existing.enabled : data.enabled,
      updatedAt: now
    }
    const index = tools.value.findIndex(t => t.id === id)
    if (index !== -1) {
      tools.value.splice(index, 1, next)
    }
    try {
      await $fetch(`/api/tools/${id}`, {
        method: 'PUT',
        body: {
          name: next.name,
          apiKey: next.apiKey,
          engineId: next.engineId,
          tavilyApiKey: next.tavilyApiKey,
          enabled: next.enabled
        }
      })
    } catch (error) {
      tools.value.splice(index, 1, existing)
      throw error
    }
    return next
  }

  async function remove(id: string) {
    const existing = tools.value.find(t => t.id === id)
    tools.value = tools.value.filter(t => t.id !== id)
    try {
      await $fetch(`/api/tools/${id}`, { method: 'DELETE' })
    } catch (error) {
      if (existing) {
        tools.value = [existing, ...tools.value]
      }
      throw error
    }
  }

  return { tools, loading, load, create, update, remove }
}, {
  persist: true
})
