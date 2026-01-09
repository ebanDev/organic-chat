<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { Memory } from '~/types'

definePageMeta({
  layout: 'settings'
})

const memoriesStore = useMemoriesStore()
const toast = useToast()

const { memories, settings: memorySettings, loading: memoryLoading, settingsLoading: memorySettingsLoading } = storeToRefs(memoriesStore)

const memoryForm = ref({
  title: '',
  content: '',
  source: ''
})
const memoryEdit = ref<Memory | null>(null)
const memoryEditOpen = ref(false)
const memorySettingsForm = ref({
  enabled: false,
  apiKey: '',
  embeddingModel: 'openai/text-embedding-3-small',
  embeddingDimensions: 1536
})

onMounted(() => {
  memoriesStore.loadSettings()
  memoriesStore.loadMemories()
})

async function saveMemorySettings() {
  try {
    const payload = {
      enabled: memorySettingsForm.value.enabled,
      apiKey: memorySettingsForm.value.apiKey,
      embeddingModel: memorySettingsForm.value.embeddingModel,
      embeddingDimensions: Number(memorySettingsForm.value.embeddingDimensions)
    }
    await memoriesStore.saveSettings(payload)
    toast.add({ title: 'Memory settings saved', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to save memory settings', color: 'error' })
  }
}

function resetMemoryForm() {
  memoryForm.value = {
    title: '',
    content: '',
    source: ''
  }
}

async function createMemory() {
  if (!memoryForm.value.title.trim() || !memoryForm.value.content.trim()) {
    toast.add({ title: 'Title and content are required', color: 'error' })
    return
  }
  try {
    await memoriesStore.createMemory({
      title: memoryForm.value.title.trim(),
      content: memoryForm.value.content.trim(),
      source: memoryForm.value.source.trim()
    })
    resetMemoryForm()
    toast.add({ title: 'Memory saved', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to save memory', color: 'error' })
  }
}

function openEditMemory(memory: Memory) {
  memoryEdit.value = { ...memory }
  memoryEditOpen.value = true
}

async function saveMemoryEdit() {
  if (!memoryEdit.value) return
  const payload = {
    title: memoryEdit.value.title.trim(),
    content: memoryEdit.value.content.trim(),
    source: memoryEdit.value.source
  }
  try {
    await memoriesStore.updateMemory(memoryEdit.value.id, payload)
    memoryEditOpen.value = false
    memoryEdit.value = null
    toast.add({ title: 'Memory updated', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to update memory', color: 'error' })
  }
}

async function deleteMemory(id: string) {
  try {
    await memoriesStore.deleteMemory(id)
  } catch {
    toast.add({ title: 'Failed to delete memory', color: 'error' })
  }
}

watch(memorySettings, (value) => {
  if (!value) return
  memorySettingsForm.value = {
    enabled: value.enabled,
    apiKey: value.apiKey,
    embeddingModel: value.embeddingModel,
    embeddingDimensions: value.embeddingDimensions
  }
}, { immediate: true })
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold">
        Memory
      </h2>
      <p class="text-muted text-sm">
        Store and manage long-term memories
      </p>
    </div>

    <UCard>
      <template #header>
        <h3 class="text-base font-semibold">
          Settings
        </h3>
      </template>

      <div class="space-y-4">
        <UFormField label="Enabled">
          <div class="flex items-center justify-between gap-3">
            <span class="text-sm text-muted">Use embeddings to add memory context to chats.</span>
            <USwitch v-model="memorySettingsForm.enabled" />
          </div>
        </UFormField>

        <UFormField label="OpenRouter API key">
          <UInput
            v-model="memorySettingsForm.apiKey"
            type="password"
            placeholder="sk-or-..."
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Embedding model">
            <UInput
              v-model="memorySettingsForm.embeddingModel"
              placeholder="openai/text-embedding-3-small"
            />
          </UFormField>
          <UFormField label="Embedding dimensions">
            <UInput
              v-model.number="memorySettingsForm.embeddingDimensions"
              type="number"
              min="1"
            />
          </UFormField>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :loading="memorySettingsLoading"
            @click="memoriesStore.loadSettings"
          >
            Refresh
          </UButton>
          <UButton
            :loading="memorySettingsLoading"
            @click="saveMemorySettings"
          >
            Save settings
          </UButton>
        </div>
      </template>
    </UCard>

    <UCard>
      <template #header>
        <h3 class="text-base font-semibold">
          Add memory
        </h3>
      </template>

      <div class="space-y-4">
        <UFormField label="Title">
          <UInput
            v-model="memoryForm.title"
            placeholder="Short label"
          />
        </UFormField>
        <UFormField label="Content">
          <UTextarea
            v-model="memoryForm.content"
            placeholder="Memory detail"
          />
        </UFormField>
        <UFormField label="Source">
          <UInput
            v-model="memoryForm.source"
            placeholder="conversation:123"
          />
        </UFormField>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="resetMemoryForm"
          >
            Clear
          </UButton>
          <UButton @click="createMemory">
            Save memory
          </UButton>
        </div>
      </template>
    </UCard>

    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <h3 class="text-base font-semibold">
            Saved memories
          </h3>
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :loading="memoryLoading"
            @click="memoriesStore.loadMemories"
          >
            Refresh
          </UButton>
        </div>
      </template>

      <div
        v-if="memoryLoading"
        class="flex justify-center py-6"
      >
        <UIcon
          name="ph:spinner-bold"
          class="animate-spin text-2xl"
        />
      </div>
      <div
        v-else-if="!memories.length"
        class="text-sm text-muted py-4"
      >
        No memories yet.
      </div>
      <div
        v-else
        class="space-y-3"
      >
        <UCard
          v-for="memory in memories"
          :key="memory.id"
          class="border border-default"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="space-y-1">
              <div class="font-semibold">
                {{ memory.title }}
              </div>
              <div class="text-sm text-muted whitespace-pre-line">
                {{ memory.content }}
              </div>
              <div
                v-if="memory.source"
                class="text-xs text-muted"
              >
                Source: {{ memory.source }}
              </div>
            </div>
            <div class="flex gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                @click="openEditMemory(memory)"
              >
                Edit
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="ph:trash-bold"
                @click="deleteMemory(memory.id)"
              />
            </div>
          </div>
        </UCard>
      </div>
    </UCard>

    <UModal v-model:open="memoryEditOpen">
      <UCard v-if="memoryEdit">
        <template #header>
          <h2 class="text-lg font-semibold">
            Edit memory
          </h2>
        </template>

        <div class="space-y-4">
          <UFormField label="Title">
            <UInput v-model="memoryEdit.title" />
          </UFormField>
          <UFormField label="Content">
            <UTextarea v-model="memoryEdit.content" />
          </UFormField>
          <UFormField label="Source">
            <UInput v-model="memoryEdit.source" />
          </UFormField>
        </div>

        <template #footer>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              @click="memoryEditOpen = false"
            >
              Cancel
            </UButton>
            <UButton @click="saveMemoryEdit">
              Save changes
            </UButton>
          </div>
        </template>
      </UCard>
    </UModal>
  </section>
</template>
