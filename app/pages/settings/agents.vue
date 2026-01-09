<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { Agent, ToolPack } from '~/types'

definePageMeta({
  layout: 'settings'
})

const providersStore = useProvidersStore()
const agentsStore = useAgentsStore()
const settingsStore = useSettingsStore()
const modelsStore = useModelsStore()
const toast = useToast()

const { providers } = storeToRefs(providersStore)
const { agents } = storeToRefs(agentsStore)

const isAddAgentModalOpen = ref(false)
const isEditAgentModalOpen = ref(false)
const editingAgent = ref<Agent | null>(null)
const editWebDefault = ref(false)
const models = ref<Record<string, string[]>>({})
const modelsLoading = ref(false)
const defaultAgentId = computed<string | undefined>({
  get: () => settingsStore.defaultAgentId ?? undefined,
  set: (value) => {
    settingsStore.setDefaultAgentId(value ?? null)
  }
})
const newAgent = ref({
  name: '',
  baseModel: '',
  systemPrompt: '',
  avatarUrl: ''
})

const agentModelOptions = computed(() => modelOptions.value)
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
  agentsStore.load()
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
  } catch {
    toast.add({ title: 'Failed to load models', color: 'error' })
  } finally {
    modelsLoading.value = false
  }
}

async function addAgent() {
  if (!newAgent.value.name.trim()) {
    toast.add({ title: 'Error', description: 'Name is required', color: 'error' })
    return
  }
  if (!newAgent.value.baseModel.trim()) {
    toast.add({ title: 'Error', description: 'Base model is required', color: 'error' })
    return
  }
  if (!newAgent.value.systemPrompt.trim()) {
    toast.add({ title: 'Error', description: 'System prompt is required', color: 'error' })
    return
  }

  try {
    await agentsStore.create({
      name: newAgent.value.name.trim(),
      baseModel: newAgent.value.baseModel.trim(),
      systemPrompt: newAgent.value.systemPrompt.trim(),
      avatarUrl: newAgent.value.avatarUrl.trim() || undefined
    })
    isAddAgentModalOpen.value = false
    newAgent.value = { name: '', baseModel: '', systemPrompt: '', avatarUrl: '' }
    toast.add({ title: 'Agent created', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to create agent', color: 'error' })
  }
}

function openEditAgent(agent: Agent) {
  editingAgent.value = { ...agent }
  const defaults = settingsStore.getAssistantToolDefaults(agent.id)
  editWebDefault.value = defaults.includes('web_navigate')
  isEditAgentModalOpen.value = true
}

async function updateAgent() {
  if (!editingAgent.value) return

  try {
    await agentsStore.update(editingAgent.value.id, {
      name: editingAgent.value.name,
      baseModel: editingAgent.value.baseModel,
      systemPrompt: editingAgent.value.systemPrompt,
      avatarUrl: editingAgent.value.avatarUrl || undefined
    })
    const toolDefaults: ToolPack[] = []
    if (editWebDefault.value) toolDefaults.push('web_navigate')
    settingsStore.setAssistantToolDefaults(editingAgent.value.id, toolDefaults)
    isEditAgentModalOpen.value = false
    editingAgent.value = null
    editWebDefault.value = false
    toast.add({ title: 'Agent updated', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to update agent', color: 'error' })
  }
}

async function deleteAgent(id: string) {
  try {
    await agentsStore.remove(id)
    toast.add({ title: 'Agent deleted', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to delete agent', color: 'error' })
  }
}

async function uploadAvatar(file: File) {
  const formData = new FormData()
  formData.append('file', file)
  const response = await $fetch<{ url: string }>('/api/uploads/agents', {
    method: 'POST',
    body: formData
  })
  return response.url
}

async function onNewAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const [file] = input.files || []
  if (!file) return
  try {
    newAgent.value.avatarUrl = await uploadAvatar(file)
  } catch {
    toast.add({ title: 'Failed to upload image', color: 'error' })
  }
}

async function onEditAvatarChange(event: Event) {
  const input = event.target as HTMLInputElement
  const [file] = input.files || []
  if (!file || !editingAgent.value) return
  try {
    editingAgent.value.avatarUrl = await uploadAvatar(file)
  } catch {
    toast.add({ title: 'Failed to upload image', color: 'error' })
  }
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
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-lg font-semibold">
          Agents
        </h2>
        <p class="text-muted text-sm">
          Custom system prompts and avatars
        </p>
      </div>
      <UButton
        icon="ph:plus-bold"
        @click="isAddAgentModalOpen = true"
      >
        Add Agent
      </UButton>
    </div>

    <UCard>
      <template #header>
        <h3 class="text-base font-semibold">
          Default Agent
        </h3>
      </template>
      <UFormField label="Use this agent by default">
        <USelect
          v-model="defaultAgentId"
          :items="agents.map(agent => ({ label: agent.name, value: agent.id }))"
          value-key="value"
          label-key="label"
          placeholder="Select an agent"
        />
      </UFormField>
    </UCard>

    <div
      v-if="agentsStore.loading"
      class="flex justify-center py-8"
    >
      <UIcon
        name="ph:spinner-bold"
        class="animate-spin text-2xl"
      />
    </div>

    <div
      v-else-if="!agents.length"
      class="text-center py-8"
    >
      <UIcon
        name="ph:user-bold"
        class="text-3xl text-muted mb-3"
      />
      <p class="text-muted mb-3">
        No agents yet
      </p>
      <UButton
        icon="ph:plus-bold"
        @click="isAddAgentModalOpen = true"
      >
        Add your first agent
      </UButton>
    </div>

    <div
      v-else
      class="space-y-4"
    >
      <UCard
        v-for="agent in agents"
        :key="agent.id"
      >
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            <UAvatar
              :src="agent.avatarUrl || undefined"
              :alt="agent.name"
              size="3xl"
            />
            <div>
              <h3 class="font-semibold">
                {{ agent.name }}
              </h3>
              <p class="text-sm text-muted">
                Base model: {{ agent.baseModel }}
              </p>
            </div>
          </div>
          <div class="flex gap-2">
            <UButton
              icon="ph:pencil-bold"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="openEditAgent(agent)"
            />
            <UButton
              icon="ph:trash-bold"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="deleteAgent(agent.id)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <UModal v-model:open="isAddAgentModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              Add Agent
            </h2>
          </template>

          <div class="space-y-4">
            <UFormField label="Name">
              <UInput
                v-model="newAgent.name"
                placeholder="Research Assistant"
              />
            </UFormField>

            <UFormField label="Base model">
              <USelect
                v-model="newAgent.baseModel"
                :items="agentModelOptions"
                :loading="modelsLoading"
                :disabled="!agentModelOptions.length"
                value-key="value"
                label-key="label"
                placeholder="Select a base model"
              />
              <template #hint>
                Load models by adding a provider.
              </template>
            </UFormField>

            <UFormField label="System prompt">
              <UTextarea
                v-model="newAgent.systemPrompt"
                :rows="6"
                placeholder="You are a helpful assistant..."
              />
            </UFormField>

            <UFormField label="Profile picture">
              <UInput
                type="file"
                accept="image/*"
                @change="onNewAvatarChange"
              />
              <template #hint>
                Stored locally with the agent profile.
              </template>
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="isAddAgentModalOpen = false"
              >
                Cancel
              </UButton>
              <UButton @click="addAgent">
                Add Agent
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <UModal v-model:open="isEditAgentModalOpen">
      <template #content>
        <UCard v-if="editingAgent">
          <template #header>
            <h2 class="text-lg font-semibold">
              Edit Agent
            </h2>
          </template>

          <div class="space-y-4">
            <UFormField label="Name">
              <UInput v-model="editingAgent.name" />
            </UFormField>

            <UFormField label="Base model">
              <USelect
                v-model="editingAgent.baseModel"
                :items="agentModelOptions"
                :loading="modelsLoading"
                :disabled="!agentModelOptions.length"
                value-key="value"
                label-key="label"
                placeholder="Select a base model"
              />
              <template #hint>
                Load models by adding a provider.
              </template>
            </UFormField>

            <UFormField label="System prompt">
              <UTextarea
                v-model="editingAgent.systemPrompt"
                :rows="6"
              />
            </UFormField>

            <UFormField label="Profile picture">
              <UInput
                type="file"
                accept="image/*"
                @change="onEditAvatarChange"
              />
              <template #hint>
                Upload to replace the current avatar.
              </template>
            </UFormField>

            <UFormField label="Default tools">
              <div class="space-y-2">
                <UCheckbox
                  v-model="editWebDefault"
                  label="Web tools enabled by default"
                />
              </div>
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="isEditAgentModalOpen = false"
              >
                Cancel
              </UButton>
              <UButton @click="updateAgent">
                Save Changes
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </section>
</template>
