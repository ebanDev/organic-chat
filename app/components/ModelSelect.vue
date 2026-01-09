<script setup lang="ts">
interface Props {
  items: Array<{ label: string, value: string }>
  modelValue: string
  loading?: boolean
  disabled?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()

const model = computed({
  get: () => props.modelValue,
  set: (value: string) => emit('update:modelValue', value)
})

const options = computed(() => props.items)
const selected = computed(() => props.items.find(item => item.value === props.modelValue) || null)
const drawerOpen = ref(false)

function selectModel(value: string) {
  emit('update:modelValue', value)
  drawerOpen.value = false
}
</script>

<template>
  <div class="hidden sm:block">
    <USelectMenu
      v-model="model"
      :items="options"
      :loading="loading"
      :disabled="disabled"
      icon="ph:brain-bold"
      variant="ghost"
      value-key="value"
      class="hover:bg-muted focus:bg-muted data-[state=open]:bg-muted"
      :ui="{
        trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
      }"
    />
  </div>

  <div class="sm:hidden">
    <UDrawer
      v-model:open="drawerOpen"
      title="Choose model"
    >
      <UButton
        icon="ph:brain-bold"
        color="neutral"
        variant="ghost"
        square
        :disabled="disabled"
      />

      <template #body>
        <div class="flex flex-col gap-2 pb-2">
          <UButton
            v-for="item in options"
            :key="item.value"
            :label="item.label"
            color="neutral"
            variant="ghost"
            class="justify-start"
            :icon="item.value === selected?.value ? 'ph:check-bold' : 'ph:brain-bold'"
            @click="selectModel(item.value)"
          />
        </div>
      </template>
    </UDrawer>
  </div>
</template>
