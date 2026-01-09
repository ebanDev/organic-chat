<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from 'ai'
import StreamMarkdown from '~/components/markdown/StreamMarkdown.vue'
import type { Conversation } from '~/types'

const route = useRoute()
const conversationsStore = useConversationsStore()
const agentsStore = useAgentsStore()
const toolsStore = useToolsStore()
const providersStore = useProvidersStore()
const toast = useToast()
const settingsStore = useSettingsStore()
const modelsStore = useModelsStore()
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
const { activeConversation, activeId, pendingMessage, pendingFiles, pendingTools } = storeToRefs(conversationsStore)
const { agents } = storeToRefs(agentsStore)
const { tools } = storeToRefs(toolsStore)
const { providers } = storeToRefs(providersStore)
const { savedModels, titleModel, memoryModel, defaultModel } = storeToRefs(settingsStore)

const modelsLoading = ref(false)
const editMessageOpen = ref(false)
const editMessageId = ref<string | null>(null)
const editMessageText = ref('')

const STREAM_RENDER_THROTTLE_MS = 80
const displayMessages = shallowRef<UIMessage[]>([])
let streamRaf: number | null = null
let streamQueued = false
let lastStreamRender = 0
const optimisticMessage = ref<UIMessage | null>(null)
const pendingHydrationId = ref<string | null>(null)

function getMessageTextFromParts(message: UIMessage): string {
  return message.parts
    .filter(part => part.type === 'text' || part.type === 'reasoning')
    .map(part => ('text' in part ? part.text : ''))
    .join('')
    .trim()
}

function applyOptimisticMessage(messages: UIMessage[]): UIMessage[] {
  if (!optimisticMessage.value) return messages
  const optimisticText = getMessageTextFromParts(optimisticMessage.value)
  const lastUser = [...messages].reverse().find(msg => msg.role === 'user')
  if (lastUser && getMessageTextFromParts(lastUser) === optimisticText) {
    optimisticMessage.value = null
    return messages
  }
  return [...messages, optimisticMessage.value]
}

function refreshDisplayMessages() {
  displayMessages.value = applyOptimisticMessage(chat.messages)
}

function scheduleStreamRefresh() {
  if (streamQueued) return
  streamQueued = true
  const tick = () => {
    const now = performance.now()
    if (now - lastStreamRender < STREAM_RENDER_THROTTLE_MS) {
      streamRaf = requestAnimationFrame(tick)
      return
    }
    lastStreamRender = now
    streamQueued = false
    streamRaf = null
    refreshDisplayMessages()
  }
  streamRaf = requestAnimationFrame(tick)
}

function stopStreamRefresh() {
  if (streamRaf !== null) {
    cancelAnimationFrame(streamRaf)
    streamRaf = null
  }
  streamQueued = false
  refreshDisplayMessages()
}

onBeforeUnmount(() => {
  if (streamRaf !== null) {
    cancelAnimationFrame(streamRaf)
    streamRaf = null
  }
  streamQueued = false
})

const conversationId = computed(() => route.params.id as string)
const chat = new Chat({
  messages: [] as UIMessage[],
  transport: new DefaultChatTransport({
    api: '/api/chat',
    body: () => ({
      conversationId: conversationId.value,
      titleModel: titleModel.value,
      memoryModel: memoryModel.value,
      timeZone,
      tools: conversationsStore.getTools(
        conversationId.value,
        settingsStore.getAssistantToolDefaults(agentsStore.active?.id ?? null)
      )
    })
  }),
  onData: (dataPart) => {
    if (dataPart?.type === 'data-memory') {
      const payload = (dataPart.data as { memorySaved?: { title?: string, content?: string } })?.memorySaved
      const description = payload?.content?.trim() || ''
      toast.add({
        title: 'Memory saved',
        description,
        color: 'success'
      })
    }
  },
  onFinish: async () => {
    console.info('[chat] onFinish', {
      messageCount: chat.messages.length
    })
    await conversationsStore.load()
    if (activeId.value) {
      await conversationsStore.loadConversation(activeId.value)
    }
  },
  onError(error) {
    const message = typeof error.message === 'string' ? error.message : String(error)
    console.error('Chat error:', error)
    toast.add({ title: 'Chat error', description: message, color: 'error' })
  }
})

watch(() => chat.status, (status) => {
  if (status === 'streaming') {
    scheduleStreamRefresh()
  } else {
    stopStreamRefresh()
  }
}, { immediate: true })

watchEffect(() => {
  if (chat.status !== 'streaming') return
  const lastMessage = chat.messages[chat.messages.length - 1]
  if (!lastMessage) return
  getMessageTextFromParts(lastMessage)
  scheduleStreamRefresh()
})

function getMessageText(message: UIMessage): string {
  return getMessageTextFromParts(message)
}

async function copyMessage(message: UIMessage) {
  const text = getMessageText(message)
  if (!text) {
    toast.add({ title: 'Nothing to copy', color: 'error' })
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    toast.add({ title: 'Message copied' })
  } catch {
    toast.add({ title: 'Copy failed', color: 'error' })
  }
}

async function restartMessage(message: UIMessage) {
  const index = chat.messages.findIndex(item => item.id === message.id)
  if (index === -1) return

  let target: UIMessage | null = null
  if (message.role === 'user') {
    target = message
  } else {
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = chat.messages[i]
      if (candidate?.role === 'user') {
        target = candidate
        break
      }
    }
  }

  if (!target) {
    toast.add({ title: 'No user message to restart from', color: 'error' })
    return
  }

  const text = getMessageText(target)
  if (!text) {
    toast.add({ title: 'Nothing to restart', color: 'error' })
    return
  }

  const cutIndex = chat.messages.findIndex(item => item.id === target?.id)
  if (cutIndex >= 0) {
    chat.messages = chat.messages.slice(0, cutIndex + 1)
  }

  if (activeConversation.value?.messages) {
    const trimmed = activeConversation.value.messages.slice()
    const dbIndex = trimmed.findIndex(msg => msg.id === target?.id)
    if (dbIndex >= 0) {
      trimmed.splice(dbIndex + 1)
      activeConversation.value = {
        ...activeConversation.value,
        messages: trimmed
      }
    }
  }

  if (target?.id) {
    await $fetch(`/api/messages/${target.id}`, { method: 'DELETE' })
  }

  await chat.sendMessage({ text })
}

function showMessageInfo(message: UIMessage) {
  const xModel = (message.metadata as { xModel?: string } | undefined)?.xModel
    || activeConversation.value?.model
    || 'Unknown'
  toast.add({ title: 'x-model', description: xModel })
}

function openEditMessage(message: UIMessage) {
  if (message.role !== 'user') {
    toast.add({ title: 'Only user messages can be edited', color: 'error' })
    return
  }
  const text = getMessageText(message)
  if (!text) {
    toast.add({ title: 'Nothing to edit', color: 'error' })
    return
  }
  editMessageId.value = message.id
  editMessageText.value = text
  editMessageOpen.value = true
}

async function confirmEditMessage() {
  if (!editMessageId.value) return
  const content = editMessageText.value.trim()
  if (!content) {
    toast.add({ title: 'Message cannot be empty', color: 'error' })
    return
  }

  const messageId = editMessageId.value
  editMessageOpen.value = false
  editMessageId.value = null

  await $fetch(`/api/messages/${messageId}`, { method: 'DELETE' })

  const index = chat.messages.findIndex(msg => msg.id === messageId)
  if (index >= 0) {
    chat.messages = chat.messages.slice(0, index)
  }

  if (activeConversation.value?.messages) {
    const trimmed = activeConversation.value.messages.slice()
    const dbIndex = trimmed.findIndex(msg => msg.id === messageId)
    if (dbIndex >= 0) {
      trimmed.splice(dbIndex)
      activeConversation.value = {
        ...activeConversation.value,
        messages: trimmed
      }
    }
  }

  await chat.sendMessage({ text: content })
}

const messageActions = [
  {
    label: 'Edit',
    icon: 'ph:pencil-bold',
    onClick: (_event: MouseEvent, message: UIMessage) => {
      openEditMessage(message)
    }
  },
  {
    label: 'Copy message',
    icon: 'ph:copy-bold',
    onClick: (_event: MouseEvent, message: UIMessage) => {
      void copyMessage(message)
    }
  },
  {
    label: 'Restart',
    icon: 'ph:arrow-counter-clockwise-bold',
    onClick: (_event: MouseEvent, message: UIMessage) => {
      void restartMessage(message)
    }
  },
  {
    label: 'Info',
    icon: 'ph:info-bold',
    onClick: (_event: MouseEvent, message: UIMessage) => {
      showMessageInfo(message)
    }
  }
]

function isSavedModel(model: string): boolean {
  return !savedModels.value.length || savedModels.value.includes(model)
}

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

const selectedModel = computed({
  get: () => {
    const providerId = activeConversation.value?.providerId
    const model = activeConversation.value?.model
    if (!providerId || !model) return ''
    return toModelKey(providerId, model)
  },
  async set(value: string) {
    if (!activeConversation.value) return
    const parsed = parseModelKey(value)
    if (!parsed) return
    const { providerId, model } = parsed
    const current = activeConversation.value
    if (providerId === current.providerId && model === current.model) return
    await conversationsStore.update(conversationId.value, { providerId, model })
  }
})

const selectedAgentId = computed({
  get: () => activeConversation.value?.agentId || NO_AGENT_VALUE,
  async set(value: string) {
    if (!activeConversation.value) return
    const next = value === NO_AGENT_VALUE ? null : value
    if (activeConversation.value.agentId === next) return
    await conversationsStore.update(conversationId.value, { agentId: next })
    agentsStore.setActive(next)
  }
})

const availableTools = computed(() => tools.value)
const providerModels = computed(() => {
  const providerId = activeConversation.value?.providerId
  return modelsStore.get(providerId)
})

const modelOptions = computed(() =>
  providers.value.flatMap(provider =>
    modelsStore.get(provider.id).filter(isSavedModel).map(model => ({
      label: `${provider.name || 'Provider'} - ${formatModelName(model)}`,
      value: toModelKey(provider.id, model)
    }))
  )
)

const NO_AGENT_VALUE = '__no_agent__'
const agentOptions = computed(() => ([
  { label: 'No agent', value: NO_AGENT_VALUE },
  ...agents.value.map(agent => ({
    label: agent.name,
    value: agent.id,
    avatarUrl: agent.avatarUrl
  }))
]))

function resolveProviderId(candidate: string | null | undefined): string | null {
  if (!providers.value.length) return null
  if (candidate && providers.value.some(provider => provider.id === candidate)) {
    if (!savedModels.value.length) {
      return candidate
    }
    const candidateModels = modelsStore.get(candidate)
    if (candidateModels.some(model => savedModels.value.includes(model))) {
      return candidate
    }
  }
  if (savedModels.value.length) {
    const match = providers.value.find(provider =>
      modelsStore.get(provider.id).some(model => savedModels.value.includes(model))
    )
    if (match) {
      return match.id
    }
  }
  return providers.value[0]?.id ?? null
}

function resolveModelId(providerId: string, candidate: string | null | undefined): string | null {
  const list = modelsStore.get(providerId)
  if (!list.length) return null
  if (savedModels.value.length) {
    const savedList = list.filter(model => savedModels.value.includes(model))
    if (!savedList.length) return null
    if (candidate && savedModels.value.includes(candidate) && list.includes(candidate)) return candidate
    if (defaultModel.value && savedModels.value.includes(defaultModel.value) && list.includes(defaultModel.value)) {
      return defaultModel.value
    }
    return savedList[0] ?? null
  }
  if (candidate && list.includes(candidate)) return candidate
  if (defaultModel.value && list.includes(defaultModel.value)) {
    return defaultModel.value
  }
  return list[0] ?? null
}

async function ensureValidConversationModel() {
  const current = activeConversation.value
  if (!current) return
  if (!providers.value.length) return

  const nextProviderId = resolveProviderId(current.providerId)
  if (!nextProviderId) return

  const nextModel = resolveModelId(nextProviderId, current.model)
  if (!nextModel) return

  if (nextProviderId === current.providerId && nextModel === current.model) return

  await conversationsStore.update(conversationId.value, {
    providerId: nextProviderId,
    model: nextModel
  })
}

const activeTools = computed({
  get: () => conversationsStore.getTools(
    conversationId.value,
    settingsStore.getAssistantToolDefaults(agentsStore.active?.id ?? null)
  ),
  set: (value) => {
    conversationsStore.setTools(conversationId.value, value)
  }
})

type RenderBlock
  = | { type: 'reasoning', text: string, isStreaming: boolean }
    | { type: 'text', text: string, isStreaming: boolean }
    | { type: 'file', url: string, mediaType?: string }
    | { type: 'tool-call', name: string, title?: string, payload: unknown }
    | { type: 'tool-result', name: string, title?: string, payload: unknown, preliminary?: boolean }
    | { type: 'tool-error', name: string, title?: string, payload: unknown }
    | { type: 'tool-approval-request', name: string, title?: string, payload: unknown }

function splitThinking(text: string, isStreaming: boolean): RenderBlock[] {
  const blocks: RenderBlock[] = []
  const openTag = '<thinking>'
  const closeTag = '</thinking>'
  let cursor = 0

  while (cursor < text.length) {
    const start = text.indexOf(openTag, cursor)
    if (start === -1) {
      const remaining = text.slice(cursor)
      if (remaining.trim()) {
        blocks.push({ type: 'text', text: remaining, isStreaming })
      }
      break
    }

    const before = text.slice(cursor, start)
    if (before.trim()) {
      blocks.push({ type: 'text', text: before, isStreaming })
    }

    const close = text.indexOf(closeTag, start + openTag.length)
    if (close === -1) {
      const reasoning = text.slice(start + openTag.length)
      if (reasoning.trim()) {
        blocks.push({ type: 'reasoning', text: reasoning.trim(), isStreaming })
      }
      break
    }

    const reasoning = text.slice(start + openTag.length, close)
    if (reasoning.trim()) {
      blocks.push({ type: 'reasoning', text: reasoning.trim(), isStreaming: false })
    }

    cursor = close + closeTag.length
  }

  return blocks
}

function toRenderBlocks(message: UIMessage) {
  const blocks: RenderBlock[] = []

  for (const part of message.parts) {
    if (part.type === 'reasoning') {
      blocks.push({
        type: 'reasoning',
        text: part.text,
        isStreaming: part.state !== 'done'
      })
      continue
    }

    if (part.type === 'text') {
      blocks.push(...splitThinking(part.text, part.state === 'streaming'))
    }

    if (part.type === 'file') {
      blocks.push({
        type: 'file',
        url: part.url,
        mediaType: part.mediaType
      })
    }

    if (isToolUIPart(part)) {
      const name = getToolName(part)
      if (part.state === 'output-available') {
        blocks.push({
          type: 'tool-result',
          name,
          title: part.title,
          payload: part.output,
          preliminary: part.preliminary
        })
        continue
      }

      if (part.state === 'output-error' || part.state === 'output-denied') {
        blocks.push({
          type: 'tool-error',
          name,
          title: part.title,
          payload: part.state === 'output-error' ? part.errorText : part.approval
        })
        continue
      }

      if (part.state === 'approval-requested' || part.state === 'approval-responded') {
        blocks.push({
          type: 'tool-approval-request',
          name,
          title: part.title,
          payload: { input: part.input, approval: part.approval }
        })
        continue
      }

      blocks.push({
        type: 'tool-call',
        name,
        title: part.title,
        payload: part.input
      })
    }
  }

  return blocks
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function toolIcon(type: RenderBlock['type']): string {
  switch (type) {
    case 'tool-call':
      return 'ph:wrench-bold'
    case 'tool-result':
      return 'ph:check-circle-bold'
    case 'tool-error':
      return 'ph:warning-circle-bold'
    case 'tool-approval-request':
      return 'ph:seal-question-bold'
    default:
      return 'ph:toolbox-bold'
  }
}

function toolHeading(type: RenderBlock['type']): string {
  switch (type) {
    case 'tool-call':
      return 'Tool call'
    case 'tool-result':
      return 'Tool result'
    case 'tool-error':
      return 'Tool error'
    case 'tool-approval-request':
      return 'Tool approval'
    default:
      return 'Tool'
  }
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

function getFileExtension(file: File): string {
  const parts = file.name.split('.')
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : ''
}

function toFileList(files: File[]): FileList {
  const dataTransfer = new DataTransfer()
  files.forEach(file => dataTransfer.items.add(file))
  return dataTransfer.files
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString()
  }

  const data = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data }).promise
  const pages: string[] = []

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex)
    const content = await page.getTextContent()
    const items = content.items as Array<{ str?: string }>
    pages.push(items.map(item => item.str || '').join(' ').trim())
  }

  return pages.join('\n\n').trim()
}

async function extractDocxText(file: File): Promise<string> {
  const mammothModule = await import('mammoth/mammoth.browser')
  const data = await file.arrayBuffer()
  const result = await mammothModule.default.extractRawText({ arrayBuffer: data })
  return result.value.trim()
}

async function extractTextFromFile(file: File): Promise<string> {
  const extension = getFileExtension(file)
  const mimeType = file.type.toLowerCase()

  if (mimeType === 'application/pdf' || extension === 'pdf') {
    return extractPdfText(file)
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || extension === 'docx'
  ) {
    return extractDocxText(file)
  }

  if (mimeType.startsWith('text/') || ['txt', 'md', 'csv', 'json', 'rtf', 'log'].includes(extension)) {
    return (await file.text()).trim()
  }

  const fallback = await file.text()
  if (fallback.includes('\u0000')) {
    throw new Error('Unsupported file format')
  }
  return fallback.trim()
}

function formatDocumentBlock(name: string, content: string): string {
  return `Document: ${name}\n\`\`\`txt\n${content}\n\`\`\``
}

async function buildDocumentsMessage(files: File[]): Promise<string> {
  const blocks: string[] = []

  for (const file of files) {
    try {
      const text = await extractTextFromFile(file)
      if (text.trim()) {
        blocks.push(formatDocumentBlock(file.name, text))
      } else {
        toast.add({ title: 'Empty document', description: `${file.name} had no extractable text`, color: 'error' })
      }
    } catch (_error) {
      const message = _error instanceof Error ? _error.message : 'Failed to extract text'
      toast.add({ title: 'Document import failed', description: `${file.name}: ${message}`, color: 'error' })
    }
  }

  return blocks.join('\n\n')
}

async function sendWithAttachments(payload: { text?: string, files?: FileList | null }) {
  const text = payload.text?.trim() || ''
  const incomingFiles = payload.files ? Array.from(payload.files) : []
  const imageFiles = incomingFiles.filter(isImageFile)
  const documentFiles = incomingFiles.filter(file => !isImageFile(file))
  const documentMessage = documentFiles.length ? await buildDocumentsMessage(documentFiles) : ''

  if (text && imageFiles.length) {
    await chat.sendMessage({
      text,
      files: toFileList(imageFiles)
    })
  } else if (text) {
    await chat.sendMessage({ text })
  } else if (imageFiles.length) {
    await chat.sendMessage({ files: toFileList(imageFiles) })
  }

  if (documentMessage) {
    await chat.sendMessage({ text: documentMessage })
  }
}

async function syncConversationSelection(): Promise<void> {
  const current = activeConversation.value
  if (!current) return

  const updates: Partial<Pick<Conversation, 'providerId' | 'agentId' | 'model'>> = {}
  const parsed = parseModelKey(selectedModel.value)
  if (parsed) {
    if (parsed.providerId !== current.providerId) {
      updates.providerId = parsed.providerId
    }
    if (parsed.model !== current.model) {
      updates.model = parsed.model
    }
  }

  const nextAgentId = selectedAgentId.value === NO_AGENT_VALUE ? null : selectedAgentId.value
  if (nextAgentId !== current.agentId) {
    updates.agentId = nextAgentId
  }

  if (Object.keys(updates).length) {
    await conversationsStore.update(conversationId.value, updates)
  }
}

async function onSubmit(payload: { text: string, files: FileList | null }) {
  if (!payload.text && !payload.files) return
  if (!selectedModel.value) {
    toast.add({ title: 'Select a model first', color: 'error' })
    return
  }

  console.info('[chat] submit', {
    conversationId: conversationId.value,
    model: selectedModel.value
  })

  const optimisticText = payload.text?.trim()
  if (optimisticText) {
    optimisticMessage.value = {
      id: `optimistic-${crypto.randomUUID()}`,
      role: 'user',
      parts: [{ type: 'text', text: optimisticText }]
    }
    refreshDisplayMessages()
  }

  try {
    await syncConversationSelection()
  } catch (error) {
    optimisticMessage.value = null
    const message = error instanceof Error ? error.message : 'Failed to update thread settings'
    toast.add({ title: 'Failed to update thread', description: message, color: 'error' })
    return
  }
  try {
    await sendWithAttachments(payload)
  } finally {
    if (!chat.messages.length) {
      optimisticMessage.value = null
      refreshDisplayMessages()
    }
  }
}

async function loadModels() {
  if (!providers.value.length) {
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
  } catch {
    toast.add({ title: 'Failed to load models', color: 'error' })
  } finally {
    modelsLoading.value = false
    await ensureValidConversationModel()
  }
}

async function initializeConversation(id: string) {
  await settingsStore.load()
  await conversationsStore.loadConversation(id)
  if (!agents.value.length) {
    await agentsStore.load()
  }
  if (!tools.value.length) {
    await toolsStore.load()
  }
  if (!providers.value.length) {
    await providersStore.load()
  }

  if (!conversationsStore.hasTools(id)) {
    const webAvailable = tools.value.some(tool =>
      tool.type === 'web_navigate' && tool.enabled
    )
    const defaults = settingsStore.getAssistantToolDefaults(agentsStore.active?.id ?? null).filter(type =>
      type === 'web_navigate' && webAvailable
    )
    conversationsStore.setTools(id, defaults)
  }

  const pending = pendingMessage.value
  const queuedFiles = pendingFiles.value
  const queuedTools = pendingTools.value
  if (queuedTools) {
    pendingTools.value = null
    conversationsStore.setTools(id, queuedTools)
  }
  if (pending) {
    pendingMessage.value = null
    pendingFiles.value = null
    await sendWithAttachments({ text: pending, files: queuedFiles })
  } else if (queuedFiles) {
    pendingFiles.value = null
    await sendWithAttachments({ files: queuedFiles })
  }
}

onMounted(async () => {
  pendingHydrationId.value = conversationId.value
  await initializeConversation(conversationId.value)
})

watch(conversationId, async (id, previous) => {
  if (!id || id === previous) return
  if (typeof chat.stop === 'function') {
    chat.stop()
  }
  chat.messages = []
  displayMessages.value = []
  optimisticMessage.value = null
  pendingHydrationId.value = id
  await initializeConversation(id)
})

watch(() => activeConversation.value, (conv) => {
  if (!conv?.messages?.length) return
  if (chat.messages.length) return
  if (conv.id !== conversationId.value) return
  if (pendingHydrationId.value && conv.id !== pendingHydrationId.value) return

  console.info('[chat] hydrate from store', {
    count: conv.messages.length
  })
  chat.messages = conv.messages.map(m => ({
    id: m.id,
    role: m.role,
    parts: [{ type: 'text' as const, text: m.content }]
  }))
  pendingHydrationId.value = null
  refreshDisplayMessages()
}, { immediate: true })

watch(() => activeConversation.value?.providerId, () => {
  loadModels()
})

watch(() => activeConversation.value?.agentId, (agentId) => {
  agentsStore.setActive(agentId ?? null)
}, { immediate: true })

watch(() => providers.value.length, () => {
  loadModels()
})

watch(
  [
    () => activeConversation.value?.providerId,
    () => activeConversation.value?.model,
    () => defaultModel.value,
    () => savedModels.value,
    () => providers.value.length,
    providerModels
  ],
  () => {
    if (modelsLoading.value) return
    void ensureValidConversationModel()
  },
  { immediate: true }
)
</script>

<template>
  <div class="h-screen w-full overflow-auto">
    <UDashboardPanel class="h-screen w-full overflow-auto">
      <template #body>
        <UContainer class="h-full flex flex-col gap-4">
          <div
            v-if="conversationsStore.loading"
            class="flex items-center gap-2 text-xs text-muted"
          >
            <UIcon
              name="ph:spinner-bold"
              class="animate-spin"
            />
            Loading thread
          </div>
          <div
            v-if="!chat.messages.length"
            class="flex flex-col items-center text-center pt-10"
          >
            <UIcon
              name="ph:chat-circle-bold"
              class="text-6xl text-muted mb-4"
            />
            <h2 class="text-xl font-semibold mb-2">
              How can I help you today?
            </h2>
            <p class="text-muted mb-4">
              Send a message to begin.
            </p>
          </div>
          <UChatMessages
            :messages="displayMessages"
            :status="chat.status"
            :user="{ side: 'right', variant: 'soft', actions: messageActions }"
            :assistant="{ side: 'left', variant: 'naked', actions: messageActions }"
            class="pb-4"
          >
            <template #content="{ message }">
              <div :class="message.role === 'user' ? '' : 'prose prose-sm dark:prose-invert'">
                <template
                  v-for="(block, index) in toRenderBlocks(message)"
                  :key="`${message.id}-${block.type}-${index}`"
                >
                  <ReasoningPanel
                    v-if="block.type === 'reasoning'"
                    :text="block.text"
                    :is-streaming="block.isStreaming"
                    :cache-key="`${message.id}-${index}-reasoning`"
                  />
                  <UAvatar
                    v-else-if="block.type === 'file'"
                    size="3xl"
                    :src="block.mediaType?.startsWith('image/') ? block.url : undefined"
                    :icon="block.mediaType?.startsWith('image/') ? undefined : 'ph:file-bold'"
                    class="border border-default rounded-lg"
                  />
                  <UAccordion
                    v-else-if="block.type === 'tool-call'"
                    :items="[{ label: block.title || block.name, icon: toolIcon(block.type) }]"
                    type="single"
                    collapsible
                    class="my-3"
                  >
                    <template #content>
                      <div class="text-xs text-muted mb-2">
                        {{ toolHeading(block.type) }}
                      </div>
                      <pre class="text-xs whitespace-pre-wrap">{{ formatJson(block.payload) }}</pre>
                    </template>
                  </UAccordion>
                  <UAccordion
                    v-else-if="block.type === 'tool-result'"
                    :items="[{ label: block.title || block.name, icon: toolIcon(block.type) }]"
                    type="single"
                    collapsible
                    class="my-3"
                  >
                    <template #content>
                      <div class="text-xs text-muted mb-2">
                        {{ toolHeading(block.type) }}{{ block.preliminary ? ' (preliminary)' : '' }}
                      </div>
                      <pre class="text-xs whitespace-pre-wrap">{{ formatJson(block.payload) }}</pre>
                    </template>
                  </UAccordion>
                  <UAccordion
                    v-else-if="block.type === 'tool-error'"
                    :items="[{ label: block.title || block.name, icon: toolIcon(block.type) }]"
                    type="single"
                    collapsible
                    class="my-3"
                  >
                    <template #content>
                      <div class="text-xs text-error mb-2">
                        {{ toolHeading(block.type) }}
                      </div>
                      <pre class="text-xs whitespace-pre-wrap">{{ formatJson(block.payload) }}</pre>
                    </template>
                  </UAccordion>
                  <UAccordion
                    v-else-if="block.type === 'tool-approval-request'"
                    :items="[{ label: block.title || block.name, icon: toolIcon(block.type) }]"
                    type="single"
                    collapsible
                    class="my-3"
                  >
                    <template #content>
                      <div class="text-xs text-muted mb-2">
                        {{ toolHeading(block.type) }}
                      </div>
                      <pre class="text-xs whitespace-pre-wrap">{{ formatJson(block.payload) }}</pre>
                    </template>
                  </UAccordion>
                  <StreamMarkdown
                    v-else-if="block.type === 'text'"
                    :content="block.text"
                    :is-streaming="block.isStreaming"
                    :custom-id="`${message.id}-${index}`"
                    class="*:first:mt-0 *:last:mb-0 prose"
                  />
                </template>
              </div>
            </template>
          </UChatMessages>
        </UContainer>
      </template>

      <template #footer>
        <UContainer class="pb-4 sm:pb-6">
          <ChatComposer
            v-model="selectedModel"
            v-model:agent-value="selectedAgentId"
            v-model:active-tools="activeTools"
            :models="modelOptions"
            :agents="agentOptions"
            :models-loading="modelsLoading"
            :disabled="modelsLoading || !providers.length"
            :tools="availableTools"
            :status="chat.status"
            :error="chat.error"
            @submit="onSubmit"
          />
        </UContainer>
      </template>
    </UDashboardPanel>

    <UModal v-model:open="editMessageOpen">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              Edit message
            </h2>
          </template>
          <UTextarea
            v-model="editMessageText"
            :rows="6"
          />
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="editMessageOpen = false"
              >
                Cancel
              </UButton>
              <UButton @click="confirmEditMessage">
                Save & Regenerate
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
