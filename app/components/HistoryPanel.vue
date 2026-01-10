<script setup lang="ts">
import { storeToRefs } from 'pinia'
import type { Conversation } from '~/types'

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

const unfiledMenuItems = computed<ChatMenuItem[]>(() =>
  buildMenuItems(unfiledConversations.value)
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
})
</script>

<template>
  <UContainer class="py-6 h-full min-h-0 flex flex-col">
    <div class="flex-1 min-h-0 overflow-y-auto">
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
                <UButton
                  icon="ph:trash-bold"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  class="shrink-0"
                  @click.stop="confirmDeleteFolder(folder.id)"
                />
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
                    v-for="item in getFolderMenuItems(folder.id)"
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
  </UContainer>
</template>
