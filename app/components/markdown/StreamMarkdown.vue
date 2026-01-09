<script setup lang="ts">
import MarkdownRender from 'markstream-vue'

interface Props {
  content: string
  isStreaming?: boolean
  customId?: string
}

const props = withDefaults(defineProps<Props>(), {
  isStreaming: false,
  customId: ''
})

const colorMode = useColorMode()

const batchRendering = computed(() => props.isStreaming)
const initialRenderBatchSize = computed(() => (props.isStreaming ? 8 : undefined))
const renderBatchSize = computed(() => (props.isStreaming ? 16 : undefined))
const renderBatchDelay = computed(() => (props.isStreaming ? 8 : undefined))
const renderBatchBudgetMs = computed(() => (props.isStreaming ? 8 : undefined))
const maxLiveNodes = computed(() => (props.isStreaming ? 0 : 320))
</script>

<template>
  <MarkdownRender
    v-if="content"
    :content="content"
    :custom-id="customId || undefined"
    :is-dark="colorMode.value === 'dark'"
    :final="!isStreaming"
    :max-live-nodes="maxLiveNodes"
    :batch-rendering="batchRendering"
    :initial-render-batch-size="initialRenderBatchSize"
    :render-batch-size="renderBatchSize"
    :render-batch-delay="renderBatchDelay"
    :render-batch-budget-ms="renderBatchBudgetMs"
  />
</template>
