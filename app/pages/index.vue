<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { ToolPack } from '~/types'

const conversationsStore = useConversationsStore()
const providersStore = useProvidersStore()
const agentsStore = useAgentsStore()
const toolsStore = useToolsStore()
const router = useRouter()
const route = useRoute()
const toast = useToast()
const settingsStore = useSettingsStore()
const modelsStore = useModelsStore()
const { apps } = useApps()
const { providers } = storeToRefs(providersStore)
const { agents, activeId: activeAgentId } = storeToRefs(agentsStore)
const { tools } = storeToRefs(toolsStore)
const { pendingMessage, pendingFiles, pendingTools } = storeToRefs(conversationsStore)
const { savedModels, defaultModel, defaultAgentId, assistantToolDefaults } = storeToRefs(settingsStore)

const modelsLoading = ref(false)
const selectedModelKey = ref('')
const activeTools = ref<ToolPack[]>([])
const activeAgent = computed(() => agentsStore.active)
const NO_AGENT_VALUE = '__no_agent__'
const selectedAgentId = computed({
  get: () => activeAgentId.value || NO_AGENT_VALUE,
  set: (value: string) => {
    agentsStore.setActive(value === NO_AGENT_VALUE ? null : value)
  }
})
const lastAgentId = ref<string | null>(null)
const availableTools = computed(() => tools.value)
function isSavedModel(model: string): boolean {
  return !savedModels.value.length || savedModels.value.includes(model)
}
const modelOptions = computed(() =>
  providers.value.flatMap(provider =>
    modelsStore.get(provider.id).filter(isSavedModel).map(model => ({
      label: `${provider.name || 'Provider'} - ${formatModelName(model)}`,
      value: toModelKey(provider.id, model)
    }))
  )
)

const agentOptions = computed(() => ([
  { label: 'No agent', value: NO_AGENT_VALUE },
  ...agents.value.map(agent => ({
    label: agent.name,
    value: agent.id,
    avatarUrl: agent.avatarUrl
  }))
]))
const queryHandled = ref(false)

function toModelKey(providerId: string, model: string): string {
  return `${encodeURIComponent(providerId)}::${encodeURIComponent(model)}`
}

function parseModelKey(value: string): { providerId: string, model: string } | null {
  const separatorIndex = value.indexOf('::')
  if (separatorIndex <= 0) return null
  const providerPart = value.slice(0, separatorIndex)
  const modelPart = value.slice(separatorIndex + 2)
  if (!providerPart || !modelPart) return null
  return {
    providerId: decodeURIComponent(providerPart),
    model: decodeURIComponent(modelPart)
  }
}

function findModelKey(modelId: string): string | null {
  for (const provider of providers.value) {
    const list = modelsStore.get(provider.id)
    if (list.includes(modelId)) {
      return toModelKey(provider.id, modelId)
    }
  }
  return null
}

function getFirstModelKey(): string {
  for (const provider of providers.value) {
    const list = modelsStore.get(provider.id).filter(isSavedModel)
    if (list.length) {
      const first = list[0]
      if (first) {
        return toModelKey(provider.id, first)
      }
    }
  }
  return ''
}

async function loadModels() {
  if (!providers.value.length) {
    selectedModelKey.value = ''
    return
  }

  modelsLoading.value = true
  try {
    await Promise.all(providers.value.map(async (provider) => {
      const cached = modelsStore.get(provider.id)
      if (cached.length) return
      const response = await $fetch<{ models: string[] }>(`/api/providers/${provider.id}/models`)
      modelsStore.set(provider.id, response.models)
    }))

    const preferredKey = defaultModel.value && isSavedModel(defaultModel.value)
      ? findModelKey(defaultModel.value)
      : null
    if (preferredKey) {
      selectedModelKey.value = preferredKey
    } else if (!selectedModelKey.value) {
      const firstKey = getFirstModelKey()
      if (firstKey) {
        selectedModelKey.value = firstKey
      }
    }
  } catch {
    if (!selectedModelKey.value) {
      selectedModelKey.value = ''
    }
    toast.add({ title: 'Failed to load models', color: 'error' })
  } finally {
    modelsLoading.value = false
  }
}

async function onSubmit(payload: { text: string, files: FileList | null }) {
  if (!payload.text && !payload.files) return
  if (modelsLoading.value) return
  if (!selectedModelKey.value) {
    toast.add({ title: 'Select a model first', color: 'error' })
    return
  }

  const parsedModel = parseModelKey(selectedModelKey.value)
  if (!parsedModel) {
    toast.add({ title: 'Select a model first', color: 'error' })
    return
  }

  const message = payload.text
  const files = payload.files
  const selectedProviderId = parsedModel.providerId
  if (!selectedProviderId) {
    console.error('No provider configured')
    return
  }

  const conversation = await conversationsStore.create({
    providerId: selectedProviderId,
    agentId: activeAgent.value?.id,
    model: parsedModel.model
  })
  conversationsStore.setActive(conversation.id)
  pendingMessage.value = message || null
  pendingFiles.value = files
  pendingTools.value = activeTools.value
  await router.push(`/chat/${conversation.id}`)
}

onMounted(async () => {
  await settingsStore.load()
  await Promise.all([
    conversationsStore.load(),
    providersStore.load(),
    agentsStore.load()
  ])
  await toolsStore.load()
  if (!activeTools.value.length) {
    const webAvailable = tools.value.some(tool =>
      tool.type === 'web_navigate' && tool.enabled
    )
    const defaults = settingsStore.getAssistantToolDefaults(activeAgent.value?.id ?? null)
    activeTools.value = defaults.filter(type =>
      type === 'web_navigate' && webAvailable
    )
  }
  await loadModels()

  if (queryHandled.value) return
  const query = route.query.q
  if (typeof query === 'string' && query.trim()) {
    const assistantParam = route.query.assistant
    if (typeof assistantParam === 'string' && assistantParam.trim()) {
      const match = agents.value.find(agent =>
        agent.id === assistantParam.trim()
        || agent.name.toLowerCase() === assistantParam.trim().toLowerCase()
      )
      if (match) {
        agentsStore.setActive(match.id)
      }
    }

    queryHandled.value = true
    await onSubmit({ text: query.trim(), files: null })
  }
})

watch(() => providers.value.length, () => {
  loadModels()
})

watch([() => activeAgent.value, () => providers.value.length], ([agent]) => {
  if (!agent || !agent.baseModel) return
  if (!isSavedModel(agent.baseModel)) return
  const agentChanged = lastAgentId.value !== agent.id
  const nextKey = findModelKey(agent.baseModel)
  if (nextKey && (agentChanged || !selectedModelKey.value || selectedModelKey.value !== nextKey)) {
    selectedModelKey.value = nextKey
  }
  lastAgentId.value = agent.id
}, { immediate: true })

watch([() => defaultModel.value, () => providers.value.length], ([model]) => {
  if (!model) return
  if (!activeAgent.value) {
    if (!isSavedModel(model)) return
    const nextKey = findModelKey(model)
    if (nextKey) {
      selectedModelKey.value = nextKey
    }
  }
}, { immediate: true })

watch([() => defaultAgentId.value, () => agents.value.length], ([agentId]) => {
  if (!agentId) return
  if (activeAgentId.value) return
  const match = agents.value.find(agent => agent.id === agentId)
  if (match) {
    agentsStore.setActive(match.id)
  }
}, { immediate: true })

watch(() => savedModels.value, () => {
  if (!selectedModelKey.value) return
  const parsed = parseModelKey(selectedModelKey.value)
  if (!parsed || !isSavedModel(parsed.model)) {
    selectedModelKey.value = getFirstModelKey()
  }
}, { immediate: true })

watch([() => assistantToolDefaults.value, () => tools.value, () => activeAgent.value?.id], ([, tools]) => {
  if (activeTools.value.length) return
  const webAvailable = tools.some(tool =>
    tool.type === 'web_navigate' && tool.enabled
  )
  const defaults = settingsStore.getAssistantToolDefaults(activeAgent.value?.id ?? null)
  activeTools.value = defaults.filter(type =>
    type === 'web_navigate' && webAvailable
  )
}, { immediate: true })
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <UContainer class="h-full flex flex-col gap-8">
        <section
          v-if="apps.length"
          class="pt-6"
        >
          <div class="grid gap-4 md:grid-cols-2">
            <UCard
              v-for="app in apps"
              :key="app.id"
            >
              <template #header>
                <div class="flex items-center justify-between gap-3">
                  <div class="flex items-center gap-2">
                    <UIcon
                      :name="app.icon"
                      class="text-lg"
                    />
                    <div>
                      <div class="font-semibold">
                        {{ app.name }}
                      </div>
                      <div class="text-xs text-muted">
                        {{ app.description }}
                      </div>
                    </div>
                  </div>
                  <UButton
                    :to="app.path"
                    icon="ph:arrow-square-out-bold"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                  />
                </div>
              </template>

              <component :is="app.widget" />
            </UCard>
          </div>
        </section>

        <div class="flex-1 flex flex-col items-center justify-center">
          <div
            v-if="!providers.length"
            class="text-center"
          >
            <UIcon
              name="ph:chat-circle-bold"
              class="text-6xl text-muted mb-4"
            />
            <h2 class="text-xl font-semibold mb-2">
              Welcome to Organic Chat
            </h2>
            <p class="text-muted mb-4">
              Configure a provider to start chatting
            </p>
            <UButton
              to="/settings"
              color="primary"
            >
              Add Provider
            </UButton>
          </div>
          <div
            v-else
            class="text-center max-w-md"
          />
        </div>
      </UContainer>
    </template>

    <template #footer>
      <UContainer class="pb-4 sm:pb-6">
        <ChatComposer
          v-model="selectedModelKey"
          v-model:agent-value="selectedAgentId"
          v-model:active-tools="activeTools"
          :models="modelOptions"
          :agents="agentOptions"
          :models-loading="modelsLoading"
          :disabled="!providers.length"
          :tools="availableTools"
          status="ready"
          @submit="onSubmit"
        />
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
