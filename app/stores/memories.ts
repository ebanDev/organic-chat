import { $fetch as ofetch } from 'ofetch'
import type { Memory, MemorySettings } from '~/types'

export const useMemoriesStore = defineStore('memories', () => {
  const memories = ref<Memory[]>([])
  const settings = ref<MemorySettings | null>(null)
  const loading = ref(false)
  const settingsLoading = ref(false)

  async function loadMemories() {
    loading.value = true
    try {
      const rows = await $fetch<Memory[]>('/api/memory')
      if (rows) {
        memories.value = rows
      }
    } catch {
      // Keep local cache when offline.
    } finally {
      loading.value = false
    }
  }

  async function loadSettings() {
    settingsLoading.value = true
    try {
      const data = await $fetch<MemorySettings>('/api/memory/settings')
      settings.value = data
    } catch {
      // Keep local cache when offline.
    } finally {
      settingsLoading.value = false
    }
  }

  async function saveSettings(payload: { enabled: boolean, apiKey: string, embeddingModel: string, embeddingDimensions: number }) {
    settingsLoading.value = true
    try {
      const data = await $fetch<MemorySettings>('/api/memory/settings', {
        method: 'PUT',
        body: payload
      })
      settings.value = data
      return data
    } finally {
      settingsLoading.value = false
    }
  }

  async function createMemory(payload: { title: string, content: string, source?: string }) {
    await $fetch('/api/memory', { method: 'POST', body: payload })
    await loadMemories()
  }

  async function updateMemory(id: string, payload: { title: string, content: string, source?: string }) {
    await $fetch(`/api/memory/${id}`, { method: 'PUT', body: payload })
    await loadMemories()
  }

  async function deleteMemory(id: string) {
    await ofetch(`/api/memory/${id}`, { method: 'DELETE' })
    await loadMemories()
  }

  return {
    memories,
    settings,
    loading,
    settingsLoading,
    loadMemories,
    loadSettings,
    saveSettings,
    createMemory,
    updateMemory,
    deleteMemory
  }
}, {
  persist: {
    pick: ['memories', 'settings']
  }
})
