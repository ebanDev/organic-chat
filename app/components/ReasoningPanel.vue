<script setup lang="ts">
import StreamMarkdown from '~/components/markdown/StreamMarkdown.vue'

interface Props {
  text: string
  isStreaming?: boolean
  cacheKey?: string
}

const props = withDefaults(defineProps<Props>(), {
  isStreaming: false,
  cacheKey: ''
})
const { text, isStreaming } = toRefs(props)

const open = ref(false)

watch(() => isStreaming.value, () => {
  open.value = isStreaming.value
}, { immediate: true })

const cacheKey = computed(() =>
  props.cacheKey || `reasoning-${text.value.length}`
)
</script>

<template>
  <UCollapsible
    v-model:open="open"
    class="flex flex-col gap-1 my-5"
  >
    <UButton
      class="p-0 group"
      color="neutral"
      variant="link"
      trailing-icon="i-ph-caret-down"
      :ui="{
        trailingIcon: text.length > 0 ? 'group-data-[state=open]:rotate-180 transition-transform duration-200' : 'hidden'
      }"
      :label="isStreaming ? 'Thinking...' : 'Thoughts'"
    />

    <template #content>
      <StreamMarkdown
        :content="text"
        :is-streaming="isStreaming"
        :custom-id="cacheKey"
        class="text-sm text-muted font-normal"
      />
    </template>
  </UCollapsible>
</template>
