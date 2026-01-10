<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'
import type { Conversation } from '~/types'

const conversationsStore = useConversationsStore()
const foldersStore = useFoldersStore()
const agentsStore = useAgentsStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const route = useRoute()
const toast = useToast()
const { apps } = useApps()
const { agents } = storeToRefs(agentsStore)
const { conversations, activeId } = storeToRefs(conversationsStore)
const { folders } = storeToRefs(foldersStore)
const { defaultAgentId } = storeToRefs(settingsStore)

useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' },
    { rel: 'apple-touch-icon', href: '/icons/icon-192.png' }
  ],
  htmlAttrs: {
    lang: 'en'
  },
  bodyAttrs: {
    tabindex: '-1'
  } as Record<string, string>
})

const title = 'Organic Chat'
const description = 'A fast, simple AI chat application'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})

onMounted(() => {
  conversationsStore.load()
  foldersStore.load()
  agentsStore.load()
  settingsStore.load()
})

async function newChat() {
  conversationsStore.setActive(null)
  if (defaultAgentId.value) {
    const match = agents.value.find(agent => agent.id === defaultAgentId.value)
    agentsStore.setActive(match ? match.id : null)
  } else {
    agentsStore.setActive(null)
  }
  await router.push('/')
}

defineShortcuts({
  meta_n: {
    usingInput: true,
    handler: () => {
      void newChat()
    }
  }
})

async function deleteConversation(id: string) {
  await conversationsStore.remove(id)
  if (activeId.value === id) {
    await router.push('/')
  }
}

async function moveConversation(id: string, folderId: string | null) {
  try {
    await conversationsStore.update(id, { folderId })
  } catch {
    toast.add({ title: 'Failed to move conversation', color: 'error' })
  }
}

async function startAgentChat(agentId: string) {
  const agent = agents.value.find(item => item.id === agentId)
  if (!agent) return

  agentsStore.setActive(agent.id)
  conversationsStore.setActive(null)
  await router.push('/')
}

interface SearchResult {
  id: string
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
  title: string | null
}

const searchOpen = ref(false)
const searchTerm = ref('')
const searchResults = ref<SearchResult[]>([])
const searching = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null
const showFolderForm = ref(false)
const folderName = ref('')
const creatingFolder = ref(false)
const openFolders = ref<Record<string, boolean>>({})
const deleteFolderOpen = ref(false)
const deleteFolderId = ref<string | null>(null)
const deleteFolderName = ref('')
const deleteFolderCount = ref(0)

async function runSearch(term: string) {
  searching.value = true
  try {
    searchResults.value = await $fetch<SearchResult[]>('/api/messages/search', {
      query: { q: term }
    })
  } catch {
    toast.add({ title: 'Search failed', color: 'error' })
  } finally {
    searching.value = false
  }
}

watch(searchTerm, (value) => {
  const term = value.trim()
  if (searchTimer) clearTimeout(searchTimer)
  if (!term) {
    searchResults.value = []
    return
  }
  searchTimer = setTimeout(() => {
    runSearch(term)
  }, 250)
})

async function openSearchResult(result: SearchResult) {
  searchOpen.value = false
  searchTerm.value = ''
  searchResults.value = []
  await router.push(`/chat/${result.conversationId}`)
}

interface ChatMenuItem extends NavigationMenuItem {
  id: string
}

const unfiledConversations = computed(() =>
  conversations.value.filter(conv => !conv.folderId)
)

function buildMenuItems(conversations: Conversation[]): ChatMenuItem[] {
  return conversations.map(conv => ({
    label: conv.title || 'New conversation',
    to: `/chat/${conv.id}`,
    slot: 'chat',
    id: conv.id
  }))
}

const unfiledMenuItems = computed<ChatMenuItem[]>(() =>
  buildMenuItems(unfiledConversations.value)
)

function getFolderConversationCount(folderId: string): number {
  return conversations.value.filter(conv => conv.folderId === folderId).length
}

async function confirmDeleteFolder(folderId: string) {
  const folder = folders.value.find(item => item.id === folderId)
  if (!folder) return
  const count = getFolderConversationCount(folderId)
  if (!count) {
    await foldersStore.remove(folderId, 'keep_chats')
    await conversationsStore.load()
    return
  }
  deleteFolderId.value = folderId
  deleteFolderName.value = folder.name
  deleteFolderCount.value = count
  deleteFolderOpen.value = true
}

async function deleteFolderAndKeepChats() {
  if (!deleteFolderId.value) return
  await foldersStore.remove(deleteFolderId.value, 'keep_chats')
  deleteFolderOpen.value = false
  deleteFolderId.value = null
  await conversationsStore.load()
}

async function deleteFolderAndChats() {
  if (!deleteFolderId.value) return
  await foldersStore.remove(deleteFolderId.value, 'delete_chats')
  deleteFolderOpen.value = false
  deleteFolderId.value = null
  await conversationsStore.load()
}

const appMenuItems = computed<NavigationMenuItem[]>(() =>
  apps.value.map(app => ({
    label: app.name,
    to: app.path,
    icon: app.icon
  }))
)

const drawerRef = ref<HTMLElement | null>(null)
const drawerOpen = ref(false)
const drawerWidth = ref(0)
const drawerTranslate = ref(-999)
const tracking = ref(false)
const dragging = ref(false)
const dragStartX = ref(0)
const dragStartY = ref(0)
const DRAG_THRESHOLD_PX = 10
const MAX_VERTICAL_DRIFT_PX = 44

const overlayOpacity = computed(() => {
  if (!drawerWidth.value) return 0
  return 1 - Math.abs(drawerTranslate.value) / drawerWidth.value
})

const mainTranslate = computed(() => {
  if (!drawerWidth.value) return 0
  return drawerTranslate.value + drawerWidth.value
})

function isMobileViewport(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches
}

function updateDrawerWidth() {
  const width = drawerRef.value?.offsetWidth ?? 0
  drawerWidth.value = width
  if (!drawerOpen.value) {
    drawerTranslate.value = -width
  }
}

function openDrawer() {
  drawerOpen.value = true
  drawerTranslate.value = 0
}

function closeDrawer() {
  drawerOpen.value = false
  drawerTranslate.value = -drawerWidth.value
}

function onTouchStart(event: TouchEvent) {
  if (!isMobileViewport()) return
  const touch = event.touches[0]
  if (!touch) return

  tracking.value = true
  dragging.value = false
  dragStartX.value = touch.clientX
  dragStartY.value = touch.clientY
}

function onTouchMove(event: TouchEvent) {
  if (!tracking.value || !isMobileViewport()) return
  if (!drawerWidth.value) {
    updateDrawerWidth()
    return
  }
  const touch = event.touches[0]
  if (!touch) return
  const deltaX = touch.clientX - dragStartX.value
  const deltaY = touch.clientY - dragStartY.value
  const absX = Math.abs(deltaX)
  const absY = Math.abs(deltaY)

  if (!dragging.value) {
    if (absY > absX + 4) {
      tracking.value = false
      return
    }
    if (absX <= absY + 4 || absX < DRAG_THRESHOLD_PX || absY > MAX_VERTICAL_DRIFT_PX) {
      tracking.value = false
      return
    }
    dragging.value = true
  }

  event.preventDefault()

  const base = drawerOpen.value ? 0 : -drawerWidth.value
  const next = Math.min(0, Math.max(-drawerWidth.value, base + deltaX))
  drawerTranslate.value = next
}

function onTouchEnd() {
  if (!tracking.value) return
  tracking.value = false
  if (!dragging.value) return
  dragging.value = false

  const shouldOpen = drawerTranslate.value > -drawerWidth.value / 2
  if (shouldOpen) {
    openDrawer()
  } else {
    closeDrawer()
  }
}

onMounted(() => {
  updateDrawerWidth()
  window.addEventListener('resize', updateDrawerWidth)
  window.addEventListener('touchstart', onTouchStart, { passive: true })
  window.addEventListener('touchmove', onTouchMove, { passive: false })
  window.addEventListener('touchend', onTouchEnd, { passive: true })
})

watch(() => route.path, () => {
  if (drawerOpen.value) {
    closeDrawer()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateDrawerWidth)
  window.removeEventListener('touchstart', onTouchStart)
  window.removeEventListener('touchmove', onTouchMove)
  window.removeEventListener('touchend', onTouchEnd)
})

function getFolderMenuItems(folderId: string) {
  const matches = conversations.value.filter(conv => conv.folderId === folderId)
  return buildMenuItems(matches)
}

async function createFolder() {
  const name = folderName.value.trim()
  if (!name) return
  creatingFolder.value = true
  try {
    const folder = await foldersStore.create(name)
    openFolders.value = { ...openFolders.value, [folder.id]: true }
    folderName.value = ''
    showFolderForm.value = false
  } catch {
    toast.add({ title: 'Failed to create folder', color: 'error' })
  } finally {
    creatingFolder.value = false
  }
}

function resetFolderForm() {
  folderName.value = ''
  showFolderForm.value = false
}

function isFolderOpen(folderId: string) {
  return openFolders.value[folderId] ?? false
}

function toggleFolder(folderId: string) {
  openFolders.value = { ...openFolders.value, [folderId]: !isFolderOpen(folderId) }
}

function getConversationActions(conversationId: string): DropdownMenuItem[][] {
  const folderMoves: DropdownMenuItem[] = [
    { label: 'No folder', onSelect: () => moveConversation(conversationId, null) },
    ...folders.value.map(folder => ({
      label: folder.name,
      onSelect: () => moveConversation(conversationId, folder.id)
    }))
  ]

  return [[
    { label: 'Delete', icon: 'ph:trash-bold', onSelect: () => deleteConversation(conversationId) }
  ], [
    { label: 'Move to folder', icon: 'ph:folder-simple-bold', children: folderMoves }
  ]]
}

const searchGroups = computed(() => {
  const messageItems = searchResults.value.map(result => ({
    label: result.content,
    description: result.title || 'New conversation',
    icon: 'ph:chat-circle-bold',
    onSelect: () => openSearchResult(result)
  }))

  return [{
    id: 'links',
    items: [
      { label: 'New chat', to: '/', icon: 'ph:plus-bold' },
      { label: 'Settings', to: '/settings', icon: 'ph:gear-bold' }
    ]
  }, {
    id: 'messages',
    label: 'Messages',
    items: messageItems
  }]
})
</script>

<template>
  <UApp>
    <UDashboardGroup unit="rem">
      <UDashboardSidebar
        id="main"
        resizable
        collapsible
        :min-size="12"
        class="sidebar-scroll"
      >
        <template #header>
          <div class="flex gap-2 flex-col w-full">
            <div class="flex w-full justify-between items-center gap-1.5 p-1">
              <NuxtLink
                to="/"
                class="font-extrabold flex items-center gap-2 text-lg"
              >
                <UIcon name="ph:chat-circle-bold" />
                Organic
              </NuxtLink>
              <UButton
                icon="ph:plus-bold"
                class="w-8 h-8"
                @click="newChat"
              />
            </div>

            <UDashboardSearchButton />
          </div>
        </template>

        <template #default>
          <div v-if="appMenuItems.length" class="mt-3">
            <div class="flex items-center justify-between px-2">
              <span class="text-xs font-semibold text-muted">Apps</span>
            </div>

            <UNavigationMenu
              :items="appMenuItems"
              orientation="vertical"
              :ui="{ link: 'overflow-hidden' }"
              class="mt-2"
            />
          </div>

          <div class="mt-3">
            <div class="flex items-center justify-between px-2">
              <span class="text-xs font-semibold text-muted">Agents</span>
            </div>

            <div
              v-if="agents.length"
              class="mt-2 space-y-1"
            >
              <UButton
                v-for="agent in agents"
                :key="agent.id"
                color="neutral"
                variant="ghost"
                class="w-full justify-start gap-2"
                @click="startAgentChat(agent.id)"
              >
                <UAvatar
                  :src="agent.avatarUrl || undefined"
                  :alt="agent.name"
                  size="xs"
                />
                <span class="truncate">{{ agent.name }}</span>
              </UButton>
            </div>
            <p
              v-else
              class="text-xs text-muted px-2 py-2"
            >
              No agents yet
            </p>
          </div>
          <div class="mt-3">
            <div class="flex items-center justify-between w-full px-2">
              <span class="text-xs font-semibold text-muted">Folders</span>
              <UButton
                icon="ph:folder-plus-bold"
                color="neutral"
                variant="ghost"
                size="xs"
                class="p-0.5"
                @click="showFolderForm ? resetFolderForm() : (showFolderForm = true)"
              />
            </div>

            <div
              v-if="showFolderForm"
              class="mt-2 px-2 flex items-center gap-2"
            >
              <UInput
                v-model="folderName"
                size="xs"
                placeholder="New folder"
                class="flex-1"
                @keydown.enter.prevent="createFolder"
              />
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                :loading="creatingFolder"
                @click="createFolder"
              >
                Create
              </UButton>
              <UButton
                size="xs"
                color="neutral"
                variant="ghost"
                icon="ph:x-bold"
                @click="resetFolderForm"
              />
            </div>

            <div
              v-if="folders.length"
              class="mt-2 space-y-1"
            >
              <div
                v-for="folder in folders"
                :key="folder.id"
              >
                <div class="relative flex items-center group">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="md"
                  class="flex-1 justify-start gap-2 text-sm pr-2 group-hover:pr-8 transition-[padding]"
                  @click="toggleFolder(folder.id)"
                >
                    <UIcon name="ph:folder-simple-bold" />
                    <span class="truncate">{{ folder.name }}</span>
                    <UIcon
                      :name="isFolderOpen(folder.id) ? 'ph:caret-down-bold' : 'ph:caret-right-bold'"
                      class="ml-auto"
                    />
                  </UButton>
                  <UButton
                    icon="ph:trash-bold"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="absolute right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    @click.stop="confirmDeleteFolder(folder.id)"
                  />
                </div>
                <div
                  v-show="isFolderOpen(folder.id)"
                  class="mt-1 border-l border-secondary-300 pl-3 ml-2"
                >
                  <UNavigationMenu
                    v-if="getFolderMenuItems(folder.id).length"
                    :items="getFolderMenuItems(folder.id)"
                    orientation="vertical"
                    :ui="{ link: 'overflow-hidden' }"
                  >
                    <template #chat-trailing="{ item: chatItem }">
                      <div class="flex -mr-1.5 translate-x-full group-hover:translate-x-0 transition-transform">
                        <UDropdownMenu
                          :items="getConversationActions((chatItem as ChatMenuItem).id)"
                          :content="{ align: 'end' }"
                        >
                          <UButton
                            icon="ph:dots-three-vertical-bold"
                            color="neutral"
                            variant="ghost"
                            size="xs"
                            class="p-0.5"
                            tabindex="-1"
                            @click.stop.prevent
                          />
                        </UDropdownMenu>
                      </div>
                    </template>
                  </UNavigationMenu>
                  <p
                    v-else
                    class="text-xs text-muted px-2 py-2"
                  >
                    No chats in this folder
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between px-2 mt-3">
            <span class="text-xs font-semibold text-muted">Chats</span>
          </div>

          <UNavigationMenu
            v-if="unfiledMenuItems.length"
            :items="unfiledMenuItems"
            orientation="vertical"
            :ui="{ link: 'overflow-hidden' }"
          >
            <template #chat-trailing="{ item }">
              <div class="flex -mr-1.5 translate-x-full group-hover:translate-x-0 transition-transform">
                <UDropdownMenu
                  :items="getConversationActions((item as ChatMenuItem).id)"
                  :content="{ align: 'end' }"
                >
                  <UButton
                    icon="ph:dots-three-vertical-bold"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="p-0.5"
                    tabindex="-1"
                    @click.stop.prevent
                  />
                </UDropdownMenu>
              </div>
            </template>
          </UNavigationMenu>

          <p
            v-else
            class="text-sm text-muted px-2 py-4"
          >
            {{ conversations.length ? 'No unfiled chats' : 'No conversations yet' }}
          </p>
        </template>

        <template #footer>
          <UButton
            to="/settings"
            icon="ph:gear-bold"
            color="neutral"
            variant="ghost"
            class="w-full justify-start"
          >
            Settings
          </UButton>
        </template>
      </UDashboardSidebar>

      <UModal v-model:open="deleteFolderOpen">
        <template #content>
          <UCard>
            <template #header>
              <h2 class="text-lg font-semibold">
                Delete folder
              </h2>
            </template>
            <p class="text-sm text-muted">
              "{{ deleteFolderName }}" has {{ deleteFolderCount }} chat{{ deleteFolderCount === 1 ? '' : 's' }}.
            </p>
            <p class="text-sm text-muted mt-2">
              Do you want to move them to global chats or delete them?
            </p>
            <template #footer>
              <div class="flex justify-end gap-2">
                <UButton
                  color="neutral"
                  variant="ghost"
                  @click="deleteFolderOpen = false"
                >
                  Cancel
                </UButton>
                <UButton
                  color="neutral"
                  variant="ghost"
                  @click="deleteFolderAndKeepChats"
                >
                  Move to chats
                </UButton>
                <UButton
                  color="error"
                  variant="solid"
                  @click="deleteFolderAndChats"
                >
                  Delete chats
                </UButton>
              </div>
            </template>
          </UCard>
        </template>
      </UModal>

      <UDashboardSearch
        v-model:open="searchOpen"
        v-model:search-term="searchTerm"
        :loading="searching"
        placeholder="Search messages..."
        :groups="searchGroups"
        :color-mode="false"
      />

      <NuxtLayout>
        <div
          class="w-full"
          :class="dragging ? '' : 'transition-transform duration-200 ease-out'"
          :style="{ transform: `translateX(${mainTranslate}px)` }"
        >
          <NuxtPage />
        </div>
      </NuxtLayout>
    </UDashboardGroup>

    <div class="fixed inset-0 z-50 pointer-events-none sm:hidden">
      <div
        class="absolute inset-0 bg-black/30 transition-opacity pointer-events-auto"
        :style="{
          opacity: overlayOpacity,
          pointerEvents: drawerOpen || dragging ? 'auto' : 'none'
        }"
        @click="closeDrawer"
      />
      <aside
        ref="drawerRef"
        class="absolute left-0 top-0 h-full w-[80vw] max-w-[360px] bg-default border-r border-default pointer-events-auto"
        :class="dragging ? '' : 'transition-transform duration-200 ease-out'"
        :style="{ transform: `translateX(${drawerTranslate}px)` }"
      >
        <div class="h-full flex flex-col">
          <div class="flex items-center justify-between px-4 py-3 border-b border-default bg-default/95">
            <span class="text-sm font-semibold">
              History
            </span>
            <UButton
              icon="ph:x-bold"
              color="neutral"
              variant="ghost"
              size="sm"
              @click="closeDrawer"
            />
          </div>
          <div class="flex-1 min-h-0">
            <HistoryPanel :show-header="false" />
          </div>
        </div>
      </aside>
    </div>
  </UApp>
</template>
