<script setup lang="ts">
definePageMeta({
  layout: 'settings'
})

const agentsStore = useAgentsStore()
const toast = useToast()

const importInput = ref<HTMLInputElement | null>(null)
const importLoading = ref(false)
const importConversationsInput = ref<HTMLInputElement | null>(null)
const importConversationsLoading = ref(false)

onMounted(() => {
  agentsStore.load()
})

function triggerImport() {
  importInput.value?.click()
}

async function onImportChange(event: Event) {
  const input = event.target as HTMLInputElement
  const [file] = input.files || []
  if (!file) return

  importLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const response = await $fetch<{ created: number, skipped: number }>('/api/import/openwebui', {
      method: 'POST',
      body: formData
    })
    await agentsStore.load()
    toast.add({
      title: 'Import complete',
      description: `Created ${response.created} agents, skipped ${response.skipped}.`,
      color: 'success'
    })
  } catch {
    toast.add({ title: 'Failed to import models', color: 'error' })
  } finally {
    importLoading.value = false
    input.value = ''
  }
}

function triggerConversationImport() {
  importConversationsInput.value?.click()
}

async function onImportConversationsChange(event: Event) {
  const input = event.target as HTMLInputElement
  const [file] = input.files || []
  if (!file) return

  importConversationsLoading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const response = await $fetch<{ created: number, skipped: number }>('/api/import/openwebui-conversations', {
      method: 'POST',
      body: formData
    })
    toast.add({
      title: 'Conversations imported',
      description: `Created ${response.created} conversations, skipped ${response.skipped}.`,
      color: 'success'
    })
  } catch {
    toast.add({ title: 'Failed to import conversations', color: 'error' })
  } finally {
    importConversationsLoading.value = false
    input.value = ''
  }
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold">
        Import
      </h2>
      <p class="text-muted text-sm">
        Bring in Open WebUI models
      </p>
    </div>

    <UCard>
      <div class="flex items-center justify-between gap-4">
        <div>
          <h3 class="font-semibold">
            Open WebUI
          </h3>
          <p class="text-sm text-muted">
            Import models from an Open WebUI export.
          </p>
        </div>
        <div class="flex flex-col gap-2 sm:flex-row">
          <UButton
            icon="ph:upload-bold"
            :loading="importLoading"
            @click="triggerImport"
          >
            Import Models
          </UButton>
          <UButton
            icon="ph:upload-bold"
            color="neutral"
            :loading="importConversationsLoading"
            @click="triggerConversationImport"
          >
            Import Conversations
          </UButton>
        </div>
      </div>
      <input
        ref="importInput"
        type="file"
        accept="application/json"
        class="hidden"
        @change="onImportChange"
      >
      <input
        ref="importConversationsInput"
        type="file"
        accept="application/json"
        class="hidden"
        @change="onImportConversationsChange"
      >
    </UCard>
  </section>
</template>
