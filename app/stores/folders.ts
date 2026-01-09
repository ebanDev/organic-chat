import type { Folder } from '~/types'

export const useFoldersStore = defineStore('folders', () => {
  const folders = ref<Folder[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const rows = await $fetch<Folder[]>('/api/folders')
      if (rows?.length) {
        folders.value = rows
      }
    } catch {
      // Keep local cache when offline.
    } finally {
      loading.value = false
    }
  }

  async function create(name: string) {
    const now = Date.now()
    const folder: Folder = {
      id: crypto.randomUUID(),
      name: name.trim(),
      createdAt: now,
      updatedAt: now
    }
    folders.value = [folder, ...folders.value]
    try {
      const saved = await $fetch<Folder>('/api/folders', {
        method: 'POST',
        body: folder
      })
      const index = folders.value.findIndex(item => item.id === folder.id)
      if (index !== -1) {
        folders.value.splice(index, 1, saved)
      }
      return saved
    } catch (error) {
      folders.value = folders.value.filter(item => item.id !== folder.id)
      throw error
    }
  }

  async function remove(id: string) {
    const existing = folders.value.find(folder => folder.id === id)
    folders.value = folders.value.filter(folder => folder.id !== id)
    if (!existing) return
    try {
      await $fetch(`/api/folders/${id}`, { method: 'DELETE' })
    } catch (error) {
      folders.value = [existing, ...folders.value]
      throw error
    }
  }

  return { folders, loading, load, create, remove }
}, {
  persist: true
})
