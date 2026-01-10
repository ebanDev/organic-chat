<script setup lang="ts">
interface AgentOption {
  label: string
  value: string
  avatarUrl?: string | null
}

interface MentionCommandItem {
  label: string
  suffix?: string
  icon?: string
  avatar?: { src?: string, alt?: string }
  value: string
}

interface AgentMentionPickerProps {
  modelValue: string
  agents: AgentOption[]
  agentValue?: string
  disabled?: boolean
}

const props = withDefaults(defineProps<AgentMentionPickerProps>(), {
  agents: () => [],
  agentValue: '',
  disabled: false
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:agentValue', value: string): void
  (event: 'requestFocus'): void
}>()

const mentionOpen = ref(false)
const mentionSearchTerm = ref('')
const anchorRef = ref<HTMLElement | null>(null)

function extractMentionQuery(value: string): { term: string, start: number, end: number } | null {
  const match = value.match(/(?:^|\s)@([^\s@]*)$/)
  if (!match) return null
  const term = match[1] ?? ''
  const end = value.length
  const start = end - term.length - 1
  return { term, start, end }
}

function closeMentionPalette() {
  mentionOpen.value = false
  mentionSearchTerm.value = ''
}

function queueRequestFocus() {
  requestAnimationFrame(() => {
    emit('requestFocus')
  })
}

function isMentionCommandItem(value: unknown): value is MentionCommandItem {
  return Boolean(value && typeof value === 'object' && 'value' in value)
}

function applyMentionSelection(value: unknown) {
  if (!isMentionCommandItem(value)) return
  emit('update:agentValue', value.value)
  const query = extractMentionQuery(props.modelValue)
  if (query) {
    const next = `${props.modelValue.slice(0, query.start)}${props.modelValue.slice(query.end)}`.trimEnd()
    emit('update:modelValue', next)
  }
  closeMentionPalette()
  queueRequestFocus()
}

const mentionItems = computed<MentionCommandItem[]>(() => {
  const term = mentionSearchTerm.value.trim().toLowerCase()
  return props.agents
    .filter(agent => !term || agent.label.toLowerCase().includes(term))
    .map(agent => ({
      label: agent.label,
      suffix: agent.value === props.agentValue ? 'Selected' : undefined,
      icon: agent.avatarUrl ? undefined : 'ph:user-bold',
      avatar: agent.avatarUrl ? { src: agent.avatarUrl ?? undefined, alt: agent.label } : undefined,
      value: agent.value
    }))
})

function selectFirstMatch(): boolean {
  const [first] = mentionItems.value
  if (!first) return false
  applyMentionSelection(first)
  return true
}

defineExpose({ selectFirstMatch })

watch(() => props.modelValue, (value) => {
  if (props.disabled) {
    if (mentionOpen.value) {
      closeMentionPalette()
    }
    return
  }
  const query = extractMentionQuery(value)
  if (!query) {
    if (mentionOpen.value) {
      closeMentionPalette()
    }
    return
  }
  mentionOpen.value = true
  mentionSearchTerm.value = query.term
  queueRequestFocus()
})

</script>

<template>
  <span
    ref="anchorRef"
    class="sr-only"
  />
  <UPopover
    v-model:open="mentionOpen"
    :modal="false"
    :dismissible="false"
    :reference="anchorRef || undefined"
    :content="{ side: 'top', align: 'start' }"
    :ui="{ content: 'p-0 w-full max-w-sm' }"
  >
    <template #content>
      <div v-if="mentionItems.length">
        <div class="px-1 py-1">
          <QuickPicker
            :open="mentionOpen"
            :items="mentionItems"
            empty-label="No agents found."
            @select="applyMentionSelection"
          />
        </div>
      </div>
      <div
        v-else
        class="px-4 py-3 text-sm text-muted"
      >
        No agents found.
      </div>
    </template>
  </UPopover>
</template>
