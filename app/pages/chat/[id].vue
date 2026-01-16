<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { nextTick } from 'vue'
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
const isEditingMessage = ref(false)
const editingMessageId = ref<string | null>(null)
const editingMessageText = ref('')
const editingMessageFiles = ref<File[]>([])

const STREAM_RENDER_THROTTLE_MS = 80
const displayMessages = shallowRef<UIMessage[]>([])
let streamRaf: number | null = null
let streamQueued = false
let lastStreamRender = 0
const optimisticMessage = ref<UIMessage | null>(null)
const pendingHydrationId = ref<string | null>(null)
const composerRef = ref<{ focusPromptInput?: () => void } | null>(null)
const imagePreviewOpen = ref(false)
const imagePreviewUrl = ref('')
const imagePreviewAlt = ref('Image preview')

const editingMessageIndex = computed(() => {
  if (!isEditingMessage.value || !editingMessageId.value) return -1
  return displayMessages.value.findIndex(message => message.id === editingMessageId.value)
})

const decoratedMessages = computed<UIMessage[]>(() => {
  const index = editingMessageIndex.value
  if (index === -1) return displayMessages.value
  return displayMessages.value.map((message, messageIndex) => {
    if (messageIndex <= index) return message
    const existingClass = (message as { class?: string }).class
    return {
      ...message,
      class: [existingClass, 'opacity-50'].filter(Boolean).join(' ')
    }
  })
})

interface DocumentAttachment {
  name: string
  content: string
}

interface ImageAttachment {
  name: string
  dataUrl: string
}

interface DocumentExtractResult {
  text: string
  attachments: DocumentAttachment[]
}

interface AttachmentsExtractResult {
  text: string
  documentAttachments: DocumentAttachment[]
  imageAttachments: ImageAttachment[]
}

function stripDocumentBlocks(text: string): string {
  return extractDocumentBlocks(text).text
}

function extractDocumentBlocks(text: string): DocumentExtractResult {
  const attachments: DocumentAttachment[] = []
  let cleaned = text

  const newPattern = /<<<DOC name="([^"]+)"\s*>>>\n([\s\S]*?)\n<<<ENDDOC>>>/g
  cleaned = cleaned.replace(newPattern, (_match, name: string, content: string) => {
    attachments.push({ name, content })
    return ''
  })

  const legacyPattern = /Document:\s*(.+)\n```txt\n([\s\S]*?)\n```/g
  cleaned = cleaned.replace(legacyPattern, (_match, name: string, content: string) => {
    attachments.push({ name: name.trim(), content })
    return ''
  })

  return {
    text: cleaned.trim(),
    attachments
  }
}

function extractAllAttachments(text: string): AttachmentsExtractResult {
  const documentAttachments: DocumentAttachment[] = []
  const imageAttachments: ImageAttachment[] = []
  let cleaned = text

  // Extract image blocks
  const imagePattern = /<<<IMG name="([^"]+)"\s*>>>\n(data:image\/[^;]+;base64,[^\n]+)\n<<<ENDIMG>>>/g
  cleaned = cleaned.replace(imagePattern, (_match, name: string, dataUrl: string) => {
    imageAttachments.push({ name, dataUrl })
    return ''
  })

  // Extract document blocks
  const docPattern = /<<<DOC name="([^"]+)"\s*>>>\n([\s\S]*?)\n<<<ENDDOC>>>/g
  cleaned = cleaned.replace(docPattern, (_match, name: string, content: string) => {
    documentAttachments.push({ name, content })
    return ''
  })

  const legacyPattern = /Document:\s*(.+)\n```txt\n([\s\S]*?)\n```/g
  cleaned = cleaned.replace(legacyPattern, (_match, name: string, content: string) => {
    documentAttachments.push({ name: name.trim(), content })
    return ''
  })

  return {
    text: cleaned.trim(),
    documentAttachments,
    imageAttachments
  }
}

function getMessageTextFromParts(message: UIMessage): string {
  return message.parts
    .filter(part => part.type === 'text' || part.type === 'reasoning')
    .map(part => ('text' in part ? stripDocumentBlocks(part.text) : ''))
    .join('')
    .trim()
}

function getMessageCopyText(message: UIMessage): string {
  return message.parts
    .filter(part => part.type === 'text')
    .map(part => ('text' in part ? stripDocumentBlocks(part.text) : ''))
    .join('')
    .trim()
}

function getRawMessageTextFromParts(message: UIMessage): string {
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

async function copyMessage(message: UIMessage) {
  const text = getMessageCopyText(message)
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

  const text = getRawMessageTextFromParts(target)
  if (!text) {
    toast.add({ title: 'Nothing to restart', color: 'error' })
    return
  }

  const files: File[] = []
  target.parts.forEach((part) => {
    if (part.type !== 'file') return
    if (!part.url || !part.url.startsWith('data:')) return
    const name = part.filename || 'attachment'
    const file = dataUrlToFile(part.url, name, part.mediaType)
    if (file) {
      files.push(file)
    }
  })

  const cutIndex = chat.messages.findIndex(item => item.id === target?.id)
  if (cutIndex >= 0) {
    chat.messages = chat.messages.slice(0, cutIndex)
  }

  if (activeConversation.value?.messages) {
    const trimmed = activeConversation.value.messages.slice()
    const dbIndex = trimmed.findIndex(msg => msg.id === target?.id)
    if (dbIndex >= 0) {
      trimmed.splice(dbIndex)
      activeConversation.value = {
        ...activeConversation.value,
        messages: trimmed
      }
    }
  }

  if (target?.id) {
    await $fetch(`/api/messages/${target.id}`, { method: 'DELETE' })
  }

  if (files.length) {
    await chat.sendMessage({ text, files: toFileList(files) })
  } else {
    await chat.sendMessage({ text })
  }
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
  const rawText = getRawMessageTextFromParts(message)
  if (!rawText) {
    toast.add({ title: 'Nothing to edit', color: 'error' })
    return
  }
  const extracted = extractAllAttachments(rawText)
  const files: File[] = []
  message.parts.forEach((part) => {
    if (part.type !== 'file') return
    if (!part.url || !part.url.startsWith('data:')) return
    const name = part.filename || 'attachment'
    const file = dataUrlToFile(part.url, name, part.mediaType)
    if (file) {
      files.push(file)
    }
  })
  editingMessageId.value = message.id
  editingMessageText.value = extracted.text

  // Convert document attachments to files
  extracted.documentAttachments.forEach((doc) => {
    const blob = new Blob([doc.content], { type: 'text/plain' })
    const file = new File([blob], doc.name, { type: 'text/plain' })
    files.push(file)
  })

  // Convert image data URLs to files
  extracted.imageAttachments.forEach((img) => {
    try {
      const arr = img.dataUrl.split(',')
      const mimeMatch = arr[0]?.match(/:(.*?);/)
      const mime = mimeMatch?.[1] || 'image/png'
      const bstr = atob(arr[1] || '')
      let n = bstr.length
      const u8arr = new Uint8Array(n)
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
      }
      const blob = new Blob([u8arr], { type: mime })
      const file = new File([blob], img.name, { type: mime })
      files.push(file)
    } catch (error) {
      console.warn('Failed to convert image data URL to file:', error)
    }
  })

  editingMessageFiles.value = files
  isEditingMessage.value = true
  nextTick(() => composerRef.value?.focusPromptInput?.())
}

function cancelEditMessage() {
  isEditingMessage.value = false
  editingMessageId.value = null
  editingMessageText.value = ''
  editingMessageFiles.value = []
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
    settingsStore.getAssistantToolDefaults(activeConversation.value?.agentId ?? null)
  ),
  set: (value) => {
    conversationsStore.setTools(conversationId.value, value)
  }
})

type RenderBlock
  = | { type: 'reasoning', text: string, isStreaming: boolean }
    | { type: 'text', text: string, isStreaming: boolean }
    | { type: 'file', url: string, mediaType?: string }
    | { type: 'document-attachment', name: string, content: string }
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
      if (message.role === 'user') {
        const extracted = extractAllAttachments(part.text)
        const textBlocks = splitThinking(extracted.text, part.state === 'streaming')
        blocks.push(...textBlocks)
        extracted.documentAttachments.forEach((attachment) => {
          blocks.push({
            type: 'document-attachment',
            name: attachment.name,
            content: attachment.content
          })
        })
        extracted.imageAttachments.forEach((attachment) => {
          blocks.push({
            type: 'file',
            url: attachment.dataUrl,
            mediaType: 'image/png'
          })
        })
      } else {
        blocks.push(...splitThinking(part.text, part.state === 'streaming'))
      }
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

function openImagePreview(url: string, alt = 'Image preview') {
  imagePreviewUrl.value = url
  imagePreviewAlt.value = alt
  imagePreviewOpen.value = true
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

const documentPreviewOpen = ref(false)
const documentPreviewName = ref('')
const documentPreviewContent = ref('')

function openDocumentPreview(payload: { name: string, content: string }) {
  documentPreviewName.value = payload.name
  documentPreviewContent.value = payload.content
  documentPreviewOpen.value = true
}

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

function getFileExtension(file: File): string {
  const parts = file.name.split('.')
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : ''
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
  return `<<<DOC name="${name}">>>\n${content}\n<<<ENDDOC>>>`
}

function dataUrlToFile(dataUrl: string, name: string, fallbackType?: string): File | null {
  try {
    const [header, data] = dataUrl.split(',')
    if (!header || !data) return null
    const mimeMatch = header.match(/:(.*?);/)
    const mime = mimeMatch?.[1] || fallbackType || 'application/octet-stream'
    const binary = atob(data)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return new File([bytes], name, { type: mime })
  } catch {
    return null
  }
}

function toFileList(files: File[]): FileList {
  const dataTransfer = new DataTransfer()
  files.forEach(file => dataTransfer.items.add(file))
  return dataTransfer.files
}

async function buildDocumentsMessage(files: File[]): Promise<string> {
  const blocks: string[] = []

  for (const file of files) {
    try {
      const text = await extractTextFromFile(file)
      blocks.push(formatDocumentBlock(file.name, text.trim()))
    } catch (_error) {
      const message = _error instanceof Error ? _error.message : 'Failed to extract text'
      toast.add({ title: 'Document import failed', description: `${file.name}: ${message}`, color: 'error' })
    }
  }

  return blocks.join('\n\n')
}

interface PreparedMessagePayload {
  text: string
  files?: File[]
}

async function prepareMessagePayload(payload: { text?: string, files?: FileList | File[] | null }): Promise<PreparedMessagePayload> {
  const text = payload.text?.trim() || ''
  const incomingFiles = payload.files ? (Array.isArray(payload.files) ? payload.files : Array.from(payload.files)) : []
  const imageFiles = incomingFiles.filter(isImageFile)
  const documentFiles = incomingFiles.filter(file => !isImageFile(file))

  // Build document blocks
  const documentMessage = documentFiles.length ? await buildDocumentsMessage(documentFiles) : ''

  return {
    text: [text, documentMessage].filter(Boolean).join('\n\n'),
    files: imageFiles.length ? imageFiles : undefined
  }
}

async function sendWithAttachments(payload: PreparedMessagePayload) {
  if (payload.files?.length) {
    const files = toFileList(payload.files)
    if (payload.text) {
      await chat.sendMessage({ text: payload.text, files })
      return
    }
    await chat.sendMessage({ files })
    return
  }
  if (payload.text) {
    await chat.sendMessage({ text: payload.text })
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

async function onSubmit(payload: { text: string, files: FileList | File[] | null }) {
  if (!payload.text && !payload.files) return
  if (!selectedModel.value) {
    toast.add({ title: 'Select a model first', color: 'error' })
    return
  }

  // Handle edit mode
  if (isEditingMessage.value && editingMessageId.value) {
    const messageId = editingMessageId.value

    // Delete the old message and all following messages
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

    // Reset edit state
    isEditingMessage.value = false
    editingMessageId.value = null
    editingMessageText.value = ''
    editingMessageFiles.value = []
  }

  console.info('[chat] submit', {
    conversationId: conversationId.value,
    model: selectedModel.value,
    isEditing: isEditingMessage.value
  })

  const preparedPayload = await prepareMessagePayload(payload)
  const optimisticText = preparedPayload.text.trim()

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
    await sendWithAttachments(preparedPayload)
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
    const defaults = settingsStore.getAssistantToolDefaults(activeConversation.value?.agentId ?? null)
    const filtered = defaults.filter(type =>
      type === 'web_navigate' && webAvailable
    )
    conversationsStore.setTools(id, filtered)
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
    const preparedPayload = await prepareMessagePayload({ text: pending, files: queuedFiles })
    await sendWithAttachments(preparedPayload)
  } else if (queuedFiles) {
    pendingFiles.value = null
    const preparedPayload = await prepareMessagePayload({ files: queuedFiles })
    await sendWithAttachments(preparedPayload)
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
    parts: Array.isArray(m.parts) && m.parts.length
      ? (m.parts as UIMessage['parts'])
      : [{ type: 'text' as const, text: m.content }]
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
            :messages="decoratedMessages"
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
                  <UButton
                    v-else-if="block.type === 'file' && block.mediaType?.startsWith('image/')"
                    variant="ghost"
                    color="neutral"
                    class="p-0"
                    @click="openImagePreview(block.url)"
                  >
                    <UAvatar
                      size="3xl"
                      :src="block.url"
                      class="border border-default rounded-lg"
                    />
                  </UButton>
                  <UAvatar
                    v-else-if="block.type === 'file'"
                    size="3xl"
                    icon="ph:file-bold"
                    class="border border-default rounded-lg"
                  />
                  <UButton
                    v-else-if="block.type === 'document-attachment'"
                    size="sm"
                    variant="soft"
                    color="neutral"
                    class="inline-flex items-center gap-2 mt-2 mr-2"
                    @click="openDocumentPreview({ name: block.name, content: block.content })"
                  >
                    <UIcon
                      name="ph:file-text-bold"
                      class="text-base"
                    />
                    <span class="truncate max-w-[16rem]">{{ block.name }}</span>
                  </UButton>
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
            ref="composerRef"
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
            :initial-text="editingMessageText"
            :initial-files="editingMessageFiles"
            :is-editing="isEditingMessage"
            @submit="onSubmit"
            @cancel="cancelEditMessage"
          />
        </UContainer>
      </template>
    </UDashboardPanel>

    <UModal v-model:open="documentPreviewOpen">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              {{ documentPreviewName }}
            </h2>
          </template>
          <pre class="text-sm whitespace-pre-wrap">{{ documentPreviewContent }}</pre>
        </UCard>
      </template>
    </UModal>

    <UModal v-model:open="imagePreviewOpen">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              {{ imagePreviewAlt }}
            </h2>
          </template>
          <img
            :src="imagePreviewUrl"
            :alt="imagePreviewAlt"
            class="max-h-[70vh] w-full object-contain rounded-md"
          >
        </UCard>
      </template>
    </UModal>
  </div>
</template>
