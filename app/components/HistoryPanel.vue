<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { DropdownMenuItem } from '@nuxt/ui'
import type { Conversation, Folder } from '~/types'

interface Props {
  showHeader?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showHeader: true
})

const conversationsStore = useConversationsStore()
const foldersStore = useFoldersStore()
const agentsStore = useAgentsStore()
const router = useRouter()
const toast = useToast()

const { conversations } = storeToRefs(conversationsStore)
const { folders } = storeToRefs(foldersStore)
const { agents } = storeToRefs(agentsStore)

const showFolderForm = ref(false)
const folderName = ref('')
const creatingFolder = ref(false)
const openFolders = ref<Record<string, boolean>>({})
const deleteFolderOpen = ref(false)
const deleteFolderId = ref<string | null>(null)
const deleteFolderName = ref('')
const deleteFolderCount = ref(0)
const renameFolderOpen = ref(false)
const renameFolderId = ref<string | null>(null)
const renameFolderName = ref('')
const sidebarSentinel = ref<HTMLElement | null>(null)
const SIDEBAR_PAGE_SIZE = 20
const sidebarUnfiledLimit = ref(SIDEBAR_PAGE_SIZE)
const sidebarFolderLimits = ref<Record<string, number>>({})
const sidebarHasScrolled = ref(false)
const sidebarScrollRef = ref<HTMLElement | null>(null)
let sidebarObserver: IntersectionObserver | null = null
let sidebarScrollEl: HTMLElement | null = null
const onSidebarScroll = () => {
  sidebarHasScrolled.value = true
}

const unfiledConversations = computed(() =>
  conversations.value.filter(conv => !conv.folderId)
)

interface ChatMenuItem {
  id: string
  label: string
  to: string
}

function buildMenuItems(list: Conversation[]): ChatMenuItem[] {
  return list.map(conv => ({
    label: conv.title || 'New conversation',
    to: `/chat/${conv.id}`,
    id: conv.id
  }))
}

function getSidebarFolderLimit(folderId: string): number {
  return sidebarFolderLimits.value[folderId] ?? SIDEBAR_PAGE_SIZE
}

function getLimitedFolderMenuItems(folderId: string) {
  return getFolderMenuItems(folderId).slice(0, getSidebarFolderLimit(folderId))
}

function increaseSidebarLimits() {
  sidebarUnfiledLimit.value += SIDEBAR_PAGE_SIZE
  const next: Record<string, number> = { ...sidebarFolderLimits.value }
  folders.value.forEach((folder) => {
    next[folder.id] = (next[folder.id] ?? SIDEBAR_PAGE_SIZE) + SIDEBAR_PAGE_SIZE
  })
  sidebarFolderLimits.value = next
}

const unfiledMenuItems = computed<ChatMenuItem[]>(() =>
  buildMenuItems(unfiledConversations.value).slice(0, sidebarUnfiledLimit.value)
)

function getFolderMenuItems(folderId: string) {
  const matches = conversations.value.filter(conv => conv.folderId === folderId)
  return buildMenuItems(matches)
}

function isFolderOpen(folderId: string) {
  return openFolders.value[folderId] ?? false
}

function toggleFolder(folderId: string) {
  openFolders.value = { ...openFolders.value, [folderId]: !isFolderOpen(folderId) }
}

function getFolderActions(folder: Folder): DropdownMenuItem[][] {
  return [[
    { label: 'Rename', icon: 'ph:pencil-bold', onSelect: () => startRenameFolder(folder) },
    { label: 'Delete', icon: 'ph:trash-bold', onSelect: () => confirmDeleteFolder(folder.id) }
  ]]
}

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

function startRenameFolder(folder: Folder) {
  renameFolderId.value = folder.id
  renameFolderName.value = folder.name
  renameFolderOpen.value = true
}

async function renameFolder() {
  if (!renameFolderId.value) return
  const name = renameFolderName.value.trim()
  if (!name) {
    toast.add({ title: 'Folder name is required', color: 'error' })
    return
  }
  try {
    await foldersStore.update(renameFolderId.value, { name })
    resetRenameFolder()
  } catch {
    toast.add({ title: 'Failed to rename folder', color: 'error' })
  }
}

function resetRenameFolder() {
  renameFolderOpen.value = false
  renameFolderId.value = null
  renameFolderName.value = ''
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
  } finally {
    creatingFolder.value = false
  }
}

function resetFolderForm() {
  folderName.value = ''
  showFolderForm.value = false
}

async function openChat(item: ChatMenuItem) {
  conversationsStore.setActive(item.id)
  await router.push(item.to)
}

onMounted(async () => {
  await Promise.all([
    conversationsStore.load(),
    foldersStore.load(),
    agentsStore.load()
  ])
  if (typeof IntersectionObserver !== 'undefined') {
    sidebarScrollEl = sidebarScrollRef.value instanceof Element ? sidebarScrollRef.value : null
    if (sidebarScrollEl) {
      sidebarScrollEl.addEventListener('scroll', onSidebarScroll, { passive: true })
    }
    const observerRoot = sidebarScrollEl instanceof Element ? sidebarScrollEl : null
    sidebarObserver = new IntersectionObserver((entries) => {
      const reached = entries.some(entry => entry.isIntersecting)
      const canLoad = sidebarHasScrolled.value || (sidebarScrollEl ? sidebarScrollEl.scrollTop > 0 : false)
      if (reached && canLoad) {
        increaseSidebarLimits()
      }
    }, { root: observerRoot, rootMargin: '0px', threshold: 0.1 })
    if (sidebarSentinel.value) {
      sidebarObserver.observe(sidebarSentinel.value)
    }
  }
})

onBeforeUnmount(() => {
  if (sidebarScrollEl) {
    sidebarScrollEl.removeEventListener('scroll', onSidebarScroll)
    sidebarScrollEl = null
  }
  sidebarObserver?.disconnect()
  sidebarObserver = null
})
</script>

<template>
  <UContainer class="py-6 h-full min-h-0 flex flex-col">
    <div
      ref="sidebarScrollRef"
      class="flex-1 min-h-0 overflow-y-auto"
    >
      <div class="flex flex-col gap-6">
        <div
          v-if="props.showHeader"
          class="flex items-center justify-between"
        >
          <div>
            <h1 class="text-2xl font-semibold">
              History
            </h1>
            <p class="text-sm text-muted">
              Recent chats and folders.
            </p>
          </div>
        </div>

        <section>
          <div class="flex items-center justify-between px-1">
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
              size="md"
              class="w-full justify-start gap-2 text-sm"
              @click="void router.push({ path: '/', query: { assistant: agent.id } })"
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
            class="text-xs text-muted px-1 py-2"
          >
            No agents yet
          </p>
        </section>

        <section>
          <div class="flex items-center justify-between w-full px-1">
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
            class="mt-2 px-1 flex items-center gap-2"
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
              <div class="flex items-center gap-1">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="md"
                  class="flex-1 justify-start gap-2 text-sm"
                  @click="toggleFolder(folder.id)"
                >
                  <UIcon name="ph:folder-simple-bold" />
                  <span class="truncate">{{ folder.name }}</span>
                  <UIcon
                    :name="isFolderOpen(folder.id) ? 'ph:caret-down-bold' : 'ph:caret-right-bold'"
                    class="ml-auto"
                  />
                </UButton>
                <UDropdownMenu
                  :items="getFolderActions(folder)"
                  :content="{ align: 'end' }"
                >
                  <UButton
                    icon="ph:dots-three-vertical-bold"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    class="shrink-0"
                    tabindex="-1"
                    @click.stop.prevent
                  />
                </UDropdownMenu>
              </div>
              <div
                v-show="isFolderOpen(folder.id)"
                class="mt-1 border-l border-secondary-300 pl-3 ml-2"
              >
                <div
                  v-if="getFolderMenuItems(folder.id).length"
                  class="space-y-1"
                >
                  <UButton
                    v-for="item in getLimitedFolderMenuItems(folder.id)"
                    :key="item.id"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    class="w-full justify-start text-sm"
                    @click="openChat(item)"
                  >
                    <span class="truncate">{{ item.label }}</span>
                  </UButton>
                </div>
                <p
                  v-else
                  class="text-xs text-muted px-2 py-2"
                >
                  No chats in this folder
                </p>
              </div>
            </div>
          </div>
          <p
            v-else
            class="text-xs text-muted px-1 py-2"
          >
            No folders yet
          </p>
        </section>

        <section>
          <div class="flex items-center justify-between px-1">
            <span class="text-xs font-semibold text-muted">Chats</span>
          </div>

          <div
            v-if="unfiledMenuItems.length"
            class="mt-2 space-y-1"
          >
            <UButton
              v-for="item in unfiledMenuItems"
              :key="item.id"
              color="neutral"
              variant="ghost"
              size="md"
              class="w-full justify-start text-sm"
              @click="openChat(item)"
            >
              <span class="truncate">{{ item.label }}</span>
            </UButton>
          </div>
          <p
            v-else
            class="text-xs text-muted px-1 py-2"
          >
            {{ conversations.length ? 'No unfiled chats' : 'No conversations yet' }}
          </p>
          <div
            ref="sidebarSentinel"
            class="h-4"
          />
        </section>
      </div>
    </div>

    <div class="shrink-0 border-t border-default pt-3 bg-default sticky bottom-0">
      <UButton
        to="/settings"
        icon="ph:gear-bold"
        color="neutral"
        variant="ghost"
        class="w-full justify-start"
      >
        Settings
      </UButton>
    </div>

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

    <UModal v-model:open="renameFolderOpen">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">
              Rename folder
            </h2>
          </template>
          <UInput
            v-model="renameFolderName"
            placeholder="Folder name"
            @keydown.enter.prevent="renameFolder"
          />
          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                color="neutral"
                variant="ghost"
                @click="resetRenameFolder"
              >
                Cancel
              </UButton>
              <UButton
                color="neutral"
                variant="solid"
                @click="renameFolder"
              >
                Save
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </UContainer>
</template>
