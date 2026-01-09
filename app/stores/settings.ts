import type { ToolPack } from '~/types'

export const useSettingsStore = defineStore('settings', () => {
  const defaultModel = ref<string | null>(null)
  const titleModel = ref<string | null>(null)
  const memoryModel = ref<string | null>(null)
  const defaultAgentId = ref<string | null>(null)
  const assistantToolDefaults = ref<Record<string, ToolPack[]>>({})
  const savedModels = ref<string[]>([])
  const hydrated = ref(false)

  async function load() {
    try {
      const data = await $fetch<{
        defaultModel: string | null
        titleModel: string | null
        memoryModel: string | null
        defaultAgentId: string | null
        savedModels: string[]
      }>('/api/settings')
      defaultModel.value = data.defaultModel ?? null
      titleModel.value = data.titleModel ?? null
      memoryModel.value = data.memoryModel ?? null
      defaultAgentId.value = data.defaultAgentId ?? null
      savedModels.value = Array.isArray(data.savedModels) ? data.savedModels : []
    } catch {
      // Keep local cache when offline.
    } finally {
      hydrated.value = true
    }
  }

  async function persist(payload: {
    defaultModel?: string | null
    titleModel?: string | null
    memoryModel?: string | null
    defaultAgentId?: string | null
    savedModels?: string[]
  }) {
    if (!hydrated.value) return
    try {
      await $fetch('/api/settings', {
        method: 'PUT',
        body: payload
      })
    } catch {
      // Keep local values when offline.
    }
  }

  async function setDefaultModel(model: string | null) {
    defaultModel.value = model
    await persist({ defaultModel: model })
  }

  async function setTitleModel(model: string | null) {
    titleModel.value = model
    await persist({ titleModel: model })
  }

  async function setMemoryModel(model: string | null) {
    memoryModel.value = model
    await persist({ memoryModel: model })
  }

  async function setDefaultAgentId(agentId: string | null) {
    defaultAgentId.value = agentId
    await persist({ defaultAgentId: agentId })
  }

  async function setAssistantToolDefaults(agentId: string, tools: ToolPack[]) {
    assistantToolDefaults.value = {
      ...assistantToolDefaults.value,
      [agentId]: tools
    }
  }

  async function setSavedModels(models: string[]) {
    savedModels.value = Array.from(new Set(models.filter(Boolean)))
    await persist({ savedModels: savedModels.value })
  }

  function getAssistantToolDefaults(agentId: string | null) {
    if (!agentId) return []
    return assistantToolDefaults.value[agentId] ?? []
  }

  return {
    defaultModel,
    titleModel,
    memoryModel,
    defaultAgentId,
    assistantToolDefaults,
    savedModels,
    load,
    setDefaultModel,
    setTitleModel,
    setMemoryModel,
    setDefaultAgentId,
    setAssistantToolDefaults,
    setSavedModels,
    getAssistantToolDefaults
  }
}, {
  persist: true
})
