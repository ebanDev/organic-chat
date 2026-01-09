export const useModelsStore = defineStore('models', () => {
  const byProvider = ref<Record<string, string[]>>({})

  function get(providerId: string | null | undefined) {
    if (!providerId) return []
    return byProvider.value[providerId] || []
  }

  function set(providerId: string, models: string[]) {
    byProvider.value = {
      ...byProvider.value,
      [providerId]: models
    }
  }

  return { byProvider, get, set }
}, {
  persist: true
})
