<script setup lang="ts">
interface Props {
  items: Array<{ label: string, value: string, avatarUrl?: string | null }>
  modelValue: string
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

function selectAgent(value: string) {
  emit('update:modelValue', value)
  drawerOpen.value = false
}
</script>

<template>
  <div class="hidden sm:block">
    <USelectMenu
      v-model="model"
      :items="options"
      :disabled="disabled"
      variant="ghost"
      value-key="value"
      class="hover:bg-muted focus:bg-muted data-[state=open]:bg-muted"
      :ui="{
        trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
      }"
    >
      <template #leading>
        <UAvatar
          v-if="selected?.avatarUrl"
          :src="selected.avatarUrl"
          :alt="selected.label"
          size="xs"
        />
        <UIcon
          v-else
          name="ph:user-bold"
          class="text-base"
        />
      </template>
    </USelectMenu>
  </div>

  <div class="sm:hidden">
    <UDrawer
      v-model:open="drawerOpen"
      title="Choose agent"
    >
      <UButton
        color="neutral"
        variant="ghost"
        square
        :disabled="disabled"
      >
        <UAvatar
          v-if="selected?.avatarUrl"
          :src="selected.avatarUrl"
          :alt="selected.label"
          size="xs"
        />
        <UIcon
          v-else
          name="ph:user-bold"
          class="text-base"
        />
      </UButton>

      <template #body>
        <div class="flex flex-col gap-2 pb-2">
          <UButton
            v-for="item in options"
            :key="item.value"
            color="neutral"
            variant="ghost"
            class="justify-start gap-2"
            @click="selectAgent(item.value)"
          >
            <UAvatar
              v-if="item.avatarUrl"
              :src="item.avatarUrl"
              :alt="item.label"
              size="xs"
            />
            <UIcon
              v-else
              name="ph:user-bold"
              class="text-base"
            />
            <span>{{ item.label }}</span>
          </UButton>
        </div>
      </template>
    </UDrawer>
  </div>
</template>
