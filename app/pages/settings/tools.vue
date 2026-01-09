<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { Tool } from '~/types'

definePageMeta({
  layout: 'settings'
})

const toolsStore = useToolsStore()
const toast = useToast()
const { tools } = storeToRefs(toolsStore)

const toolsModal = ref<'web' | null>(null)
const webToolsEnabled = ref(true)
const webToolForm = ref({
  googleApiKey: '',
  googleEngineId: '',
  tavilyApiKey: ''
})

const toolsModalOpen = computed({
  get: () => toolsModal.value !== null,
  set: (value: boolean) => {
    if (!value) toolsModal.value = null
  }
})

const webTool = computed<Tool | null>(() =>
  tools.value.find(tool => tool.type === 'web_navigate') ?? null
)

onMounted(() => {
  toolsStore.load()
})

function openToolsModal(type: 'web') {
  toolsModal.value = type
}

function toolStatusLabel(tool: Tool | null): string {
  if (!tool) return 'Not configured'
  return tool.enabled ? 'Enabled' : 'Disabled'
}

function toolStatusColor(tool: Tool | null): 'success' | 'warning' | 'neutral' {
  if (!tool) return 'warning'
  return tool.enabled ? 'success' : 'neutral'
}

function syncWebToolsEnabled() {
  webToolsEnabled.value = Boolean(webTool.value?.enabled)
}

watch(webTool, (tool) => {
  if (tool) {
    webToolForm.value = {
      googleApiKey: tool.apiKey,
      googleEngineId: tool.engineId,
      tavilyApiKey: tool.tavilyApiKey
    }
    syncWebToolsEnabled()
    return
  }
  webToolForm.value = {
    googleApiKey: '',
    googleEngineId: '',
    tavilyApiKey: ''
  }
  syncWebToolsEnabled()
}, { immediate: true })

async function saveWebTools() {
  if (webToolsEnabled.value) {
    if (!webToolForm.value.googleApiKey.trim()) {
      toast.add({ title: 'Google API key is required', color: 'error' })
      return
    }
    if (!webToolForm.value.googleEngineId.trim()) {
      toast.add({ title: 'Search engine ID is required', color: 'error' })
      return
    }
    if (!webToolForm.value.tavilyApiKey.trim()) {
      toast.add({ title: 'Tavily API key is required', color: 'error' })
      return
    }
  }

  try {
    if (webTool.value) {
      await toolsStore.update(webTool.value.id, {
        name: webTool.value?.name ?? 'Web Tools',
        apiKey: webToolForm.value.googleApiKey.trim(),
        engineId: webToolForm.value.googleEngineId.trim(),
        tavilyApiKey: webToolForm.value.tavilyApiKey.trim(),
        enabled: webToolsEnabled.value
      })
    } else {
      await toolsStore.create({
        type: 'web_navigate',
        name: 'Web Tools',
        apiKey: webToolForm.value.googleApiKey.trim(),
        engineId: webToolForm.value.googleEngineId.trim(),
        tavilyApiKey: webToolForm.value.tavilyApiKey.trim(),
        enabled: webToolsEnabled.value
      })
    }

    await toolsStore.load()
    toast.add({ title: 'Web tools saved', color: 'success' })
  } catch {
    toast.add({ title: 'Failed to save web tools', color: 'error' })
  }
}

async function deleteWebTools() {
  if (webTool.value) {
    await toolsStore.remove(webTool.value.id)
  }
  await toolsStore.load()
}
</script>

<template>
  <section class="space-y-6">
    <div>
      <h2 class="text-lg font-semibold">
        Tools
      </h2>
      <p class="text-muted text-sm">
        Connect external tools for the assistant
      </p>
    </div>

    <div
      v-if="toolsStore.loading"
      class="flex justify-center py-8"
    >
      <UIcon
        name="ph:spinner-bold"
        class="animate-spin text-2xl"
      />
    </div>

    <div
      v-else
      class="grid gap-4 sm:grid-cols-2"
    >
      <UCard>
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <UAvatar
              icon="ph:globe-bold"
              size="sm"
            />
            <div>
              <div class="font-semibold">
                Web Tools
              </div>
              <div class="text-xs text-muted">
                Search + read
              </div>
            </div>
          </div>
          <UBadge :color="toolStatusColor(webTool)">
            {{ toolStatusLabel(webTool) }}
          </UBadge>
        </div>
        <template #footer>
          <div class="flex justify-end">
            <UButton
              size="sm"
              @click="openToolsModal('web')"
            >
              {{ webTool ? 'Edit' : 'Connect' }}
            </UButton>
          </div>
        </template>
      </UCard>
    </div>

    <UModal v-model:open="toolsModalOpen">
      <template #content>
        <UCard v-if="toolsModal === 'web'">
          <template #header>
            <h2 class="text-lg font-semibold">
              Web Tools
            </h2>
          </template>

          <div class="space-y-4">
            <UFormField label="Enabled">
              <div class="flex items-center justify-between gap-3">
                <span class="text-sm text-muted">Allow the assistant to use web search and read.</span>
                <USwitch v-model="webToolsEnabled" />
              </div>
            </UFormField>

            <UFormField label="Google API key">
              <UInput
                v-model="webToolForm.googleApiKey"
                type="password"
                placeholder="AIza..."
              />
            </UFormField>

            <UFormField label="Search engine ID (cx)">
              <UInput
                v-model="webToolForm.googleEngineId"
                placeholder="0123456789abcdef:abc123def"
              />
              <template #hint>
                Create a Programmable Search Engine and paste its cx identifier here.
              </template>
            </UFormField>

            <UFormField label="Tavily API key">
              <UInput
                v-model="webToolForm.tavilyApiKey"
                type="password"
                placeholder="tvly-..."
              />
            </UFormField>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="toolsModal = null"
              >
                Cancel
              </UButton>
              <UButton
                v-if="webTool"
                color="neutral"
                variant="ghost"
                @click="deleteWebTools"
              >
                Disconnect
              </UButton>
              <UButton @click="saveWebTools">
                {{ webTool ? 'Save changes' : 'Connect tools' }}
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </section>
</template>
