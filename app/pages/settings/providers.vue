<script setup lang="ts">
import { storeToRefs } from 'pinia'

definePageMeta({
  layout: 'settings'
})

const providersStore = useProvidersStore()
const modelsStore = useModelsStore()
const toast = useToast()
const { providers } = storeToRefs(providersStore)

const isAddModalOpen = ref(false)
const isEditModalOpen = ref(false)
const editingProvider = ref<{ id: string, name: string, apiKey: string, baseUrl: string } | null>(null)
const newProvider = ref({
  name: '',
  apiKey: '',
  baseUrl: ''
})

onMounted(() => {
  providersStore.load()
})

async function addProvider() {
  if (!newProvider.value.name.trim() || !newProvider.value.apiKey.trim()) {
    toast.add({ title: 'Error', description: 'Name and API key are required', color: 'error' })
    return
  }

  try {
    await providersStore.create({
      name: newProvider.value.name.trim(),
      apiKey: newProvider.value.apiKey.trim(),
      baseUrl: newProvider.value.baseUrl.trim() || undefined
    })
    isAddModalOpen.value = false
    newProvider.value = { name: '', apiKey: '', baseUrl: '' }
    toast.add({ title: 'Provider added', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to add provider', color: 'error' })
  }
}

function openEdit(provider: { id: string, name: string, apiKey: string, baseUrl: string | null }) {
  editingProvider.value = {
    id: provider.id,
    name: provider.name,
    apiKey: provider.apiKey,
    baseUrl: provider.baseUrl || ''
  }
  isEditModalOpen.value = true
}

async function updateProvider() {
  if (!editingProvider.value) return

  try {
    await providersStore.update(editingProvider.value.id, {
      name: editingProvider.value.name,
      apiKey: editingProvider.value.apiKey,
      baseUrl: editingProvider.value.baseUrl || undefined
    })
    isEditModalOpen.value = false
    editingProvider.value = null
    modelsStore.$patch({ byProvider: {} })
    toast.add({ title: 'Provider updated', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to update provider', color: 'error' })
  }
}

async function deleteProvider(id: string) {
  try {
    await providersStore.remove(id)
    toast.add({ title: 'Provider deleted', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to delete provider', color: 'error' })
  }
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold">
          Providers
        </h2>
        <p class="text-muted text-sm">
          API keys and endpoints
        </p>
      </div>
      <UButton
        icon="ph:plus-bold"
        @click="isAddModalOpen = true"
      >
        Add Provider
      </UButton>
    </div>

    <div
      v-if="providersStore.loading"
      class="flex justify-center py-12"
    >
      <UIcon
        name="ph:spinner-bold"
        class="animate-spin text-2xl"
      />
    </div>

    <div
      v-else-if="!providers.length"
      class="text-center py-12"
    >
      <UIcon
        name="ph:key-bold"
        class="text-4xl text-muted mb-4"
      />
      <p class="text-muted mb-4">
        No providers configured yet
      </p>
      <UButton
        icon="ph:plus-bold"
        @click="isAddModalOpen = true"
      >
        Add your first provider
      </UButton>
    </div>

    <div
      v-else
      class="space-y-4"
    >
      <UCard
        v-for="provider in providers"
        :key="provider.id"
      >
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-semibold">
              {{ provider.name }}
            </h3>
            <p class="text-sm text-muted">
              {{ provider.baseUrl || 'OpenAI API (default)' }}
            </p>
            <p class="text-xs text-muted mt-1">
              API Key: {{ provider.apiKey.slice(0, 8) }}...{{ provider.apiKey.slice(-4) }}
            </p>
          </div>
          <div class="flex gap-2">
            <UButton
              icon="ph:pencil-bold"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="openEdit(provider)"
            />
            <UButton
              icon="ph:trash-bold"
              color="error"
              variant="ghost"
              size="sm"
              @click="deleteProvider(provider.id)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <UModal v-model:open="isAddModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              Add Provider
            </h2>
          </template>

          <div class="space-y-4">
            <UFormField label="Name">
              <UInput
                v-model="newProvider.name"
                placeholder="My OpenAI"
              />
            </UFormField>

            <UFormField label="API Key">
              <UInput
                v-model="newProvider.apiKey"
                type="password"
                placeholder="sk-..."
              />
            </UFormField>

            <UFormField label="Base URL (optional)">
              <UInput
                v-model="newProvider.baseUrl"
                placeholder="https://api.openai.com/v1"
              />
              <template #hint>
                Leave empty for OpenAI. Use custom URL for compatible providers (e.g., OpenRouter, Together, local).
              </template>
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="isAddModalOpen = false"
              >
                Cancel
              </UButton>
              <UButton @click="addProvider">
                Add Provider
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal v-model:open="isEditModalOpen">
      <template #content>
        <UCard v-if="editingProvider">
          <template #header>
            <h2 class="text-lg font-semibold">
              Edit Provider
            </h2>
          </template>

          <div class="space-y-4">
            <UFormField label="Name">
              <UInput v-model="editingProvider.name" />
            </UFormField>

            <UFormField label="API Key">
              <UInput
                v-model="editingProvider.apiKey"
                type="password"
              />
            </UFormField>

            <UFormField label="Base URL (optional)">
              <UInput
                v-model="editingProvider.baseUrl"
                placeholder="https://api.openai.com/v1"
              />
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="isEditModalOpen = false"
              >
                Cancel
              </UButton>
              <UButton @click="updateProvider">
                Save Changes
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </section>
</template>
