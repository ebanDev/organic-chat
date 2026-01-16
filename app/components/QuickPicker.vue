<script setup lang="ts">
interface QuickPickerItem {
  label: string
  suffix?: string
  description?: string
  icon?: string
  avatar?: { src?: string, alt?: string }
  data?: unknown
}

interface QuickPickerProps {
  open: boolean
  items?: QuickPickerItem[]
  emptyLabel?: string
}

const props = withDefaults(defineProps<QuickPickerProps>(), {
  items: () => [],
  emptyLabel: 'No results.'
})

const emit = defineEmits<{
  (event: 'select', value: QuickPickerItem): void
}>()

const activeIndex = ref(0)

function setActive(index: number) {
  if (!props.items.length) {
    activeIndex.value = 0
    return
  }
  const next = Math.max(0, Math.min(index, props.items.length - 1))
  activeIndex.value = next
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open) return
  const hasItems = props.items.length > 0

  if (event.key === 'ArrowDown') {
    if (!hasItems) return
    event.preventDefault()
    setActive((activeIndex.value + 1) % props.items.length)
    return
  }

  if (event.key === 'ArrowUp') {
    if (!hasItems) return
    event.preventDefault()
    setActive((activeIndex.value - 1 + props.items.length) % props.items.length)
    return
  }

  if (event.key === 'Enter') {
    if (!hasItems) return
    event.preventDefault()
    event.stopImmediatePropagation()
    event.stopPropagation()
    const item = props.items[activeIndex.value]
    if (item) {
      emit('select', item)
    }
  }
}

watch(() => props.open, (open) => {
  if (open) {
    activeIndex.value = 0
  }
})

watch(() => props.items.length, () => {
  activeIndex.value = 0
})

onMounted(() => {
  window.addEventListener('keydown', handleKeydown, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown, true)
})
</script>

<template>
  <div class="w-full">
    <div
      v-if="!items.length"
      class="px-4 py-3 text-sm text-muted"
    >
      {{ emptyLabel }}
    </div>
    <div
      v-else
      class="max-h-96 overflow-auto py-1"
    >
      <UButton
        v-for="(item, index) in items"
        :key="`${item.label}-${index}`"
        color="neutral"
        variant="ghost"
        class="w-full justify-start gap-2"
        :class="index === activeIndex ? 'bg-muted' : ''"
        @mouseenter="setActive(index)"
        @click="emit('select', item)"
      >
        <UAvatar
          v-if="item.avatar?.src"
          :src="item.avatar.src"
          :alt="item.avatar.alt || item.label"
          size="xs"
        />
        <UIcon
          v-else-if="item.icon"
          :name="item.icon"
          class="text-base"
        />
        <div class="flex-1 text-left truncate">
          {{ item.label }}
        </div>
        <span
          v-if="item.suffix"
          class="text-xs text-muted"
        >
          {{ item.suffix }}
        </span>
      </UButton>
    </div>
  </div>
</template>
