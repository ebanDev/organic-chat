<script setup lang="ts">
import { storeToRefs } from 'pinia'

definePageMeta({
  layout: 'settings'
})

const providersStore = useProvidersStore()
const settingsStore = useSettingsStore()
const modelsStore = useModelsStore()
const toast = useToast()

const { providers } = storeToRefs(providersStore)

const models = ref<Record<string, string[]>>({})
const modelsLoading = ref(false)
const savedModels = computed({
  get: () => settingsStore.savedModels || [],
  set: (value: string[]) => {
    settingsStore.setSavedModels(value)
  }
})
const defaultModel = computed<string | undefined>({
  get: () => settingsStore.defaultModel ?? undefined,
  set: (value) => {
    settingsStore.setDefaultModel(value ?? null)
  }
})
const titleModel = computed<string | undefined>({
  get: () => settingsStore.titleModel ?? undefined,
  set: (value) => {
    settingsStore.setTitleModel(value ?? null)
  }
})
const memoryModel = computed<string | undefined>({
  get: () => settingsStore.memoryModel ?? undefined,
  set: (value) => {
    settingsStore.setMemoryModel(value ?? null)
  }
})

const modelOptions = computed(() =>
  Object.entries(models.value).flatMap(([providerId, list]) => {
    const provider = providers.value.find(item => item.id === providerId)
    const name = provider?.name ?? 'Provider'
    return list.map(model => ({
      label: `${name} - ${formatModelName(model)}`,
      value: model
    }))
  })
)

onMounted(() => {
  settingsStore.load()
  providersStore.load()
  loadAllModels()
})

async function loadAllModels() {
  modelsLoading.value = true
  try {
    const entries = await Promise.all(
      providers.value.map(async (provider) => {
        const cached = modelsStore.get(provider.id)
        if (cached.length) {
          return [provider.id, cached] as const
        }
        const response = await $fetch<{ models: string[] }>(`/api/providers/${provider.id}/models`)
        modelsStore.set(provider.id, response.models)
        return [provider.id, response.models] as const
      })
    )
    models.value = Object.fromEntries(entries)
    const allModels = entries.flatMap(([, list]) => list)
    if (defaultModel.value && !allModels.includes(defaultModel.value)) {
      defaultModel.value = undefined
    }
    if (titleModel.value && !allModels.includes(titleModel.value)) {
      titleModel.value = undefined
    }
    if (memoryModel.value && !allModels.includes(memoryModel.value)) {
      memoryModel.value = undefined
    }
    if (savedModels.value.length) {
      const filtered = savedModels.value.filter(model => allModels.includes(model))
      if (!areSameArray(filtered, savedModels.value)) {
        savedModels.value = filtered
      }
    }
  } catch {
    toast.add({ title: 'Failed to load models', color: 'error' })
  } finally {
    modelsLoading.value = false
  }
}

function areSameArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  return left.every((item, index) => item === right[index])
}

watch(() => providers.value, (list) => {
  if (!list.length) {
    models.value = {}
    return
  }
  loadAllModels()
}, { immediate: true })
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold">
        Models
      </h2>
      <p class="text-muted text-sm">
        Default model selections
      </p>
    </div>

    <UCard v-if="providers.length">
      <template #header>
        <h2 class="text-lg font-semibold">
          Defaults
        </h2>
      </template>

      <div class="space-y-4">
        <UFormField label="Saved Model">
          <USelectMenu
            v-model="savedModels"
            :items="modelOptions"
            value-key="value"
            label-key="label"
            multiple
            :loading="modelsLoading"
            placeholder="Select saved models"
          />
          <template #hint>
            Only saved models show up in the chat model picker.
          </template>
        </UFormField>

        <UFormField label="Chat Model">
          <USelectMenu
            v-model="defaultModel"
            :items="modelOptions"
            value-key="value"
            label-key="label"
            :loading="modelsLoading"
            placeholder="Select a chat model"
          >
            <template #empty>
              No models found
            </template>
          </USelectMenu>
        </UFormField>

        <UFormField label="Title Model">
          <USelectMenu
            v-model="titleModel"
            :items="modelOptions"
            value-key="value"
            label-key="label"
            :loading="modelsLoading"
            placeholder="Select a title model"
          >
            <template #empty>
              No models found
            </template>
          </USelectMenu>
          <template #hint>
            Used to generate conversation titles.
          </template>
        </UFormField>

        <UFormField label="Memory Model">
          <USelectMenu
            v-model="memoryModel"
            :items="modelOptions"
            value-key="value"
            label-key="label"
            :loading="modelsLoading"
            placeholder="Select a memory model"
          >
            <template #empty>
              No models found
            </template>
          </USelectMenu>
          <template #hint>
            Used to extract memories from conversations.
          </template>
        </UFormField>
      </div>
    </UCard>

    <UCard v-else>
      <div class="text-sm text-muted">
        Add a provider to load available models.
      </div>
    </UCard>
  </section>
</template>
