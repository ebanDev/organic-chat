<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { Agent, ToolPack, AgentKnowledgeBase } from '~/types'

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
const knowledgeBaseFiles = ref<AgentKnowledgeBase[]>([])
const knowledgeBaseLoading = ref(false)
const obsidianSearchQuery = ref('')
const obsidianSearchResults = ref<{ name: string, relativePath: string }[]>([])
const obsidianSearchLoading = ref(false)
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
  loadKnowledgeBase(agent.id)
}

async function loadKnowledgeBase(agentId: string) {
  knowledgeBaseLoading.value = true
  try {
    knowledgeBaseFiles.value = await agentsStore.loadKnowledgeBase(agentId)
  } catch {
    toast.add({ title: 'Failed to load knowledge base', color: 'error' })
  } finally {
    knowledgeBaseLoading.value = false
  }
}

async function searchObsidianFiles() {
  if (!obsidianSearchQuery.value.trim()) {
    obsidianSearchResults.value = []
    return
  }

  obsidianSearchLoading.value = true
  try {
    const response = await $fetch<{ results: { name: string, relativePath: string }[] }>('/api/obsidian/search', {
      query: { q: obsidianSearchQuery.value.trim() }
    })
    obsidianSearchResults.value = response.results
  } catch (error: unknown) {
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : null
    if (statusCode === 400) {
      toast.add({ title: 'Obsidian vault not configured', description: 'Please set OBSIDIAN_VAULT_PATH environment variable', color: 'warning' })
    } else {
      toast.add({ title: 'Failed to search files', color: 'error' })
    }
  } finally {
    obsidianSearchLoading.value = false
  }
}

async function addKnowledgeFile(filePath: string) {
  if (!editingAgent.value) return

  try {
    const added = await agentsStore.addKnowledgeFile(editingAgent.value.id, filePath)
    knowledgeBaseFiles.value = [added, ...knowledgeBaseFiles.value]
    obsidianSearchQuery.value = ''
    obsidianSearchResults.value = []
    toast.add({ title: 'File attached', color: 'success' })
  } catch (error: unknown) {
    const statusCode = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : null
    if (statusCode === 409) {
      toast.add({ title: 'File already attached', color: 'warning' })
    } else {
      toast.add({ title: 'Failed to attach file', color: 'error' })
    }
  }
}

async function removeKnowledgeFile(kbId: string) {
  if (!editingAgent.value) return

  try {
    await agentsStore.removeKnowledgeFile(editingAgent.value.id, kbId)
    knowledgeBaseFiles.value = knowledgeBaseFiles.value.filter(f => f.id !== kbId)
    toast.add({ title: 'File removed', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to remove file', color: 'error' })
  }
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

watch(obsidianSearchQuery, () => {
  if (obsidianSearchQuery.value.trim()) {
    searchObsidianFiles()
  } else {
    obsidianSearchResults.value = []
  }
})
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

            <UFormField label="Knowledge Base">
              <template #hint>
                Attach Obsidian documents that will be included in every chat context.
              </template>
              <div class="space-y-3">
                <div class="flex gap-2">
                  <UInput
                    v-model="obsidianSearchQuery"
                    placeholder="Search Obsidian files..."
                    class="flex-1"
                    @keyup.enter="searchObsidianFiles"
                  />
                  <UButton
                    icon="ph:magnifying-glass-bold"
                    :loading="obsidianSearchLoading"
                    @click="searchObsidianFiles"
                  >
                    Search
                  </UButton>
                </div>

                <div
                  v-if="obsidianSearchResults.length"
                  class="border rounded-md divide-y max-h-48 overflow-y-auto"
                >
                  <button
                    v-for="result in obsidianSearchResults"
                    :key="result.relativePath"
                    class="w-full px-3 py-2 text-left hover:bg-muted/50 transition-colors text-sm"
                    @click="addKnowledgeFile(result.relativePath)"
                  >
                    <div class="font-medium">
                      {{ result.name }}
                    </div>
                    <div class="text-xs text-muted">
                      {{ result.relativePath }}
                    </div>
                  </button>
                </div>

                <div
                  v-if="knowledgeBaseLoading"
                  class="flex justify-center py-4"
                >
                  <UIcon
                    name="ph:spinner-bold"
                    class="animate-spin text-xl"
                  />
                </div>

                <div
                  v-else-if="knowledgeBaseFiles.length"
                  class="space-y-2"
                >
                  <div class="text-xs font-medium text-muted">
                    Attached Files
                  </div>
                  <div class="border rounded-md divide-y">
                    <div
                      v-for="file in knowledgeBaseFiles"
                      :key="file.id"
                      class="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <div class="flex-1 truncate">
                        {{ file.filePath }}
                      </div>
                      <UButton
                        icon="ph:trash-bold"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                        @click="removeKnowledgeFile(file.id)"
                      />
                    </div>
                  </div>
                </div>

                <div
                  v-else
                  class="text-sm text-muted text-center py-4"
                >
                  No files attached yet
                </div>
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
