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

  async function update(id: string, data: Partial<Pick<Folder, 'name'>>) {
    const existing = folders.value.find(folder => folder.id === id)
    if (!existing) return
    const nextName = data.name?.trim() ?? existing.name
    const index = folders.value.findIndex(folder => folder.id === id)
    const next: Folder = {
      ...existing,
      name: nextName,
      updatedAt: Date.now()
    }
    if (index !== -1) {
      folders.value.splice(index, 1, next)
    }
    try {
      const saved = await $fetch<Folder>(`/api/folders/${id}`, {
        method: 'PUT',
        body: { name: nextName }
      })
      const savedIndex = folders.value.findIndex(folder => folder.id === id)
      if (savedIndex !== -1) {
        folders.value.splice(savedIndex, 1, saved)
      }
    } catch (error) {
      const rollbackIndex = folders.value.findIndex(folder => folder.id === id)
      if (rollbackIndex !== -1) {
        folders.value.splice(rollbackIndex, 1, existing)
      }
      throw error
    }
  }

  async function remove(id: string, action: 'keep_chats' | 'delete_chats' = 'keep_chats') {
    const existing = folders.value.find(folder => folder.id === id)
    folders.value = folders.value.filter(folder => folder.id !== id)
    if (!existing) return
    try {
      await $fetch(`/api/folders/${id}`, {
        method: 'DELETE',
        params: { action }
      })
    } catch (error) {
      folders.value = [existing, ...folders.value]
      throw error
    }
  }

  return { folders, loading, load, create, update, remove }
}, {
  persist: true
})
