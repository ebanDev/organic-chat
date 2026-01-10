<script setup lang="ts">
import type { ChatStatus } from 'ai'
import type { Tool, ToolPack } from '~/types'

interface ModelOption {
  label: string
  value: string
}

interface AgentOption {
  label: string
  value: string
  avatarUrl?: string | null
}

interface ChatComposerProps {
  modelValue: string
  models: ModelOption[]
  agentValue?: string
  agents?: AgentOption[]
  modelsLoading?: boolean
  disabled?: boolean
  status?: ChatStatus
  error?: Error
  tools?: Tool[]
  activeTools?: ToolPack[]
}

const props = withDefaults(defineProps<ChatComposerProps>(), {
  modelsLoading: false,
  disabled: false,
  status: 'ready',
  agentValue: '',
  agents: () => [],
  tools: () => [],
  activeTools: () => []
})

const emit = defineEmits<{
  (event: 'update:modelValue' | 'update:agentValue', value: string): void
  (event: 'update:activeTools', value: ToolPack[]): void
  (event: 'submit', payload: { text: string, files: FileList | null }): void
}>()

const input = ref('')
const selectedFiles = ref<Array<{ file: File, previewUrl?: string }>>([])
const mentionPickerRef = ref<{ selectFirstMatch?: () => boolean } | null>(null)
const promptRef = ref<{ $el?: HTMLElement } | null>(null)

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

const model = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

const agent = computed({
  get: () => props.agentValue,
  set: (value: string) => emit('update:agentValue', value)
})

const webToolsAvailable = computed(() =>
  props.tools.some(tool => tool.type === 'web_navigate' && tool.enabled)
)
const webToolsEnabled = computed(() => props.activeTools.includes('web_navigate'))

function toggleWebTools() {
  if (props.disabled) return
  const next: ToolPack[] = webToolsEnabled.value ? [] : ['web_navigate']
  emit('update:activeTools', next)
}

function onFilesSelected(event: Event) {
  if (props.disabled) return
  const inputEl = event.target as HTMLInputElement
  const files = Array.from(inputEl.files || [])
  inputEl.value = ''

  addFiles(files)
}

function addFiles(files: File[]) {
  const newItems = files.map(file => ({
    file,
    previewUrl: isImageFile(file) ? URL.createObjectURL(file) : undefined
  }))
  if (!newItems.length) return
  selectedFiles.value = [...selectedFiles.value, ...newItems]
}

function onPaste(event: ClipboardEvent) {
  if (props.disabled) return
  const items = event.clipboardData?.items
  if (!items?.length) return
  const files = Array.from(items)
    .map(item => item.getAsFile())
    .filter((file): file is File => file instanceof File && isImageFile(file))
  if (!files.length) return
  event.preventDefault()
  addFiles(files)
}

function removeFile(index: number) {
  const [removed] = selectedFiles.value.splice(index, 1)
  if (removed?.previewUrl) {
    URL.revokeObjectURL(removed.previewUrl)
  }
}

function handleSubmit() {
  const mentionQuery = input.value.match(/(?:^|\s)@([^\s@]*)$/)
  if (mentionQuery) {
    const applied = mentionPickerRef.value?.selectFirstMatch?.()
    if (applied) return
  }
  const text = input.value.trim()
  const files = selectedFiles.value.map(item => item.file)
  if (!text && !files.length) return

  const dataTransfer = new DataTransfer()
  files.forEach(file => dataTransfer.items.add(file))

  emit('submit', {
    text,
    files: files.length ? dataTransfer.files : null
  })

  input.value = ''
  selectedFiles.value.forEach((item) => {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl)
    }
  })
  selectedFiles.value = []
}

function focusPromptInput() {
  nextTick(() => {
    requestAnimationFrame(() => {
      const root = promptRef.value?.$el
      const inputEl = root?.querySelector('textarea, input')
      if (inputEl instanceof HTMLTextAreaElement || inputEl instanceof HTMLInputElement) {
        inputEl.focus()
      }
    })
  })
}

</script>

<template>
  <UChatPrompt
    ref="promptRef"
    v-model="input"
    placeholder="Send a message..."
    :error="error"
    :disabled="disabled"
    @submit="handleSubmit"
    @paste="onPaste"
  >
    <template #header>
      <div
        v-if="selectedFiles.length"
        class="flex flex-wrap gap-2"
      >
        <div
          v-for="(item, index) in selectedFiles"
          :key="item.previewUrl || `${item.file.name}-${item.file.lastModified}`"
          class="relative"
        >
          <UAvatar
            v-if="item.previewUrl"
            size="3xl"
            :src="item.previewUrl"
            :alt="item.file.name"
            class="border border-default rounded-lg"
          />
          <UButton
            v-else
            size="sm"
            variant="soft"
            color="neutral"
            class="pointer-events-none max-w-[12rem]"
          >
            <UIcon
              name="ph:file-bold"
              class="text-base"
            />
            <span class="ml-2 truncate">{{ item.file.name }}</span>
          </UButton>
          <UButton
            icon="ph:x-bold"
            size="xs"
            square
            color="neutral"
            variant="solid"
            class="absolute p-0 -top-1 -right-1 rounded-full"
            @click="removeFile(index)"
          />
        </div>
      </div>
      <ObsidianVaultPicker
        v-model="input"
        :disabled="disabled"
        class="mt-2"
        @attach="addFiles"
        @request-focus="focusPromptInput"
      />
      <AgentMentionPicker
        v-model="input"
        :agents="agents"
        :agent-value="agentValue"
        :disabled="disabled"
        class="mt-2"
        ref="mentionPickerRef"
        @update:agent-value="emit('update:agentValue', $event)"
        @request-focus="focusPromptInput"
      />
    </template>

    <template #footer>
      <div class="flex items-center gap-1">
        <label class="cursor-pointer">
          <UButton
            icon="ph:paperclip-bold"
            variant="ghost"
            color="neutral"
            as="span"
            :disabled="disabled"
          />
          <input
            type="file"
            multiple
            class="hidden"
            :disabled="disabled"
            @change="onFilesSelected"
          >
        </label>
        <UButton
          v-if="webToolsAvailable"
          icon="ph:globe-bold"
          :variant="webToolsEnabled ? 'solid' : 'ghost'"
          :color="webToolsEnabled ? 'primary' : 'neutral'"
          :disabled="disabled || !webToolsAvailable"
          title="Web tools"
          square
          class="justify-center"
          @click="toggleWebTools"
        />
      </div>
      <div class="flex items-center gap-2">
        <ModelSelect
          v-model="model"
          :items="models"
          :loading="modelsLoading"
          :disabled="disabled"
        />
        <AgentSelect
          v-model="agent"
          :items="agents"
          :disabled="disabled"
        />
        <UChatPromptSubmit :status="status" />
      </div>
    </template>
  </UChatPrompt>
</template>
