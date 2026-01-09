import type { Provider } from '~/types'

export const useProvidersStore = defineStore('providers', () => {
  const providers = ref<Provider[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const rows = await $fetch<Provider[]>('/api/providers')
      if (rows?.length) {
        providers.value = rows
      }
    } catch {
      // Keep local cache when offline.
    } finally {
      loading.value = false
    }
  }

  async function create(data: { name: string, apiKey: string, baseUrl?: string }) {
    const now = Date.now()
    const provider: Provider = {
      id: crypto.randomUUID(),
      name: data.name.trim(),
      apiKey: data.apiKey.trim(),
      baseUrl: data.baseUrl?.trim() || null,
      createdAt: now,
      updatedAt: now
    }
    providers.value = [provider, ...providers.value]
    try {
      const saved = await $fetch<Provider>('/api/providers', {
        method: 'POST',
        body: provider
      })
      const index = providers.value.findIndex(item => item.id === provider.id)
      if (index !== -1) {
        providers.value.splice(index, 1, saved)
      }
      return saved
    } catch (error) {
      providers.value = providers.value.filter(item => item.id !== provider.id)
      throw error
    }
  }

  async function update(id: string, data: Partial<Pick<Provider, 'name' | 'apiKey' | 'baseUrl'>>) {
    const existing = providers.value.find(p => p.id === id)
    if (!existing) {
      throw new Error('Provider not found')
    }
    const now = Date.now()
    const next: Provider = {
      ...existing,
      name: data.name?.trim() || existing.name,
      apiKey: data.apiKey?.trim() ?? existing.apiKey,
      baseUrl: data.baseUrl === null ? null : (data.baseUrl?.trim() || existing.baseUrl),
      updatedAt: now
    }
    const index = providers.value.findIndex(p => p.id === id)
    if (index !== -1) {
      providers.value.splice(index, 1, next)
    }
    try {
      await $fetch(`/api/providers/${id}`, {
        method: 'PUT',
        body: { name: next.name, apiKey: next.apiKey, baseUrl: next.baseUrl }
      })
    } catch (error) {
      providers.value.splice(index, 1, existing)
      throw error
    }
    return next
  }

  async function remove(id: string) {
    const existing = providers.value.find(p => p.id === id)
    providers.value = providers.value.filter(p => p.id !== id)
    try {
      await $fetch(`/api/providers/${id}`, { method: 'DELETE' })
    } catch (error) {
      if (existing) {
        providers.value = [existing, ...providers.value]
      }
      throw error
    }
  }

  return { providers, loading, load, create, update, remove }
}, {
  persist: true
})
