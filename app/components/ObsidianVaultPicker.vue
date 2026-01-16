<script setup lang="ts">
interface ObsidianSearchResult {
  name: string
  relativePath: string
  extension: string
}

interface ObsidianVaultPickerProps {
  modelValue: string
  disabled?: boolean
}

const props = withDefaults(defineProps<ObsidianVaultPickerProps>(), {
  disabled: false
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'attach', files: File[]): void
  (event: 'requestFocus'): void
}>()

const toast = useToast()
const obsidianOpen = ref(false)
const obsidianSearchTerm = ref('')
const obsidianResults = ref<ObsidianSearchResult[]>([])
const obsidianLoading = ref(false)
const anchorRef = ref<HTMLElement | null>(null)
const prefetchedResults = ref<ObsidianSearchResult[]>([])
let obsidianSearchTimer: ReturnType<typeof setTimeout> | null = null
let obsidianSearchRequestId = 0
const OBSIDIAN_SEARCH_DEBOUNCE_MS = 200

function extractHashtagQuery(value: string): { term: string, start: number, end: number } | null {
  const match = value.match(/(?:^|\s)#([^\s#]*)$/)
  if (!match) return null
  const term = match[1] ?? ''
  const end = value.length
  const start = end - term.length - 1
  return { term, start, end }
}

function closeObsidianPalette() {
  obsidianOpen.value = false
  obsidianSearchTerm.value = ''
  obsidianResults.value = []
  obsidianLoading.value = false
}

function queueRequestFocus() {
  requestAnimationFrame(() => {
    emit('requestFocus')
  })
}

async function fetchObsidianResults(term: string) {
  const requestId = ++obsidianSearchRequestId
  obsidianLoading.value = true
  try {
    const response = await $fetch<{ results: ObsidianSearchResult[] }>('/api/obsidian/search', {
      params: term ? { q: term } : undefined
    })
    if (requestId !== obsidianSearchRequestId) return
    obsidianResults.value = response.results
    if (!term) {
      prefetchedResults.value = response.results
    }
  } catch (error) {
    if (requestId !== obsidianSearchRequestId) return
    const message = error instanceof Error ? error.message : 'Failed to search vault'
    toast.add({ title: 'Obsidian search failed', description: message, color: 'error' })
    obsidianResults.value = []
  } finally {
    if (requestId === obsidianSearchRequestId) {
      obsidianLoading.value = false
    }
  }
}

function scheduleObsidianSearch(term: string) {
  if (obsidianSearchTimer) {
    clearTimeout(obsidianSearchTimer)
  }
  obsidianSearchTimer = setTimeout(() => {
    void fetchObsidianResults(term)
  }, OBSIDIAN_SEARCH_DEBOUNCE_MS)
}

function updateInputAfterAttach() {
  const query = extractHashtagQuery(props.modelValue)
  if (!query) return
  const next = `${props.modelValue.slice(0, query.start)}${props.modelValue.slice(query.end)}`.trimEnd()
  emit('update:modelValue', next)
}

interface ObsidianQuickItem {
  label: string
  suffix?: string
  icon?: string
  data: ObsidianSearchResult
}

function isObsidianQuickItem(value: unknown): value is ObsidianQuickItem {
  return Boolean(value && typeof value === 'object' && 'data' in value)
}

async function attachObsidianFile(value: unknown) {
  if (!isObsidianQuickItem(value)) return
  const item = value
  try {
    const response = await $fetch<{ name: string, content: string, mimeType: string }>('/api/obsidian/file', {
      params: { path: item.data.relativePath }
    })
    const file = new File([response.content], response.name, { type: response.mimeType })
    emit('attach', [file])
    updateInputAfterAttach()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to attach file'
    toast.add({ title: 'Obsidian attach failed', description: message, color: 'error' })
  } finally {
    closeObsidianPalette()
    emit('requestFocus')
  }
}

watch(() => props.modelValue, (value) => {
  if (props.disabled) {
    if (obsidianOpen.value) {
      closeObsidianPalette()
    }
    return
  }
  const query = extractHashtagQuery(value)
  if (!query) {
    if (obsidianOpen.value) {
      closeObsidianPalette()
    }
    return
  }
  obsidianOpen.value = true
  queueRequestFocus()
  if (query.term !== obsidianSearchTerm.value) {
    obsidianSearchTerm.value = query.term
    scheduleObsidianSearch(query.term)
  }
  if (!query.term && prefetchedResults.value.length && !obsidianResults.value.length) {
    obsidianResults.value = prefetchedResults.value
  }
})

onMounted(() => {
  void fetchObsidianResults('')
})

watch(obsidianSearchTerm, (term) => {
  if (!obsidianOpen.value) return
  const query = extractHashtagQuery(props.modelValue)
  if (!query) return
  const next = `${props.modelValue.slice(0, query.start + 1)}${term}`
  if (next !== props.modelValue) {
    emit('update:modelValue', next)
  }
  scheduleObsidianSearch(term)
})

const obsidianItems = computed<ObsidianQuickItem[]>(() =>
  obsidianResults.value.map(result => ({
    label: result.name,
    suffix: result.relativePath,
    icon: 'ph:note-blank-bold',
    data: result
  }))
)
</script>

<template>
  <span
    ref="anchorRef"
    class="sr-only"
  />
  <UPopover
    v-model:open="obsidianOpen"
    :modal="false"
    :dismissible="false"
    :reference="anchorRef || undefined"
    :content="{ side: 'top', align: 'start' }"
    :ui="{ content: 'p-0 w-full max-w-sm' }"
  >
    <template #content>
      <div class="px-1 py-1">
        <div
          v-if="obsidianLoading"
          class="px-3 py-2 text-xs text-muted"
        >
          Searching…
        </div>
        <QuickPicker
          :open="obsidianOpen"
          :items="obsidianItems"
          empty-label="No notes found."
          @select="attachObsidianFile"
        />
      </div>
    </template>
  </UPopover>
</template>
