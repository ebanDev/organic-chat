<script setup lang="ts">
const config = useRuntimeConfig()
const key = ref('')
const errorMessage = ref('')
const isLoading = ref(false)
const cookie = useCookie<string | null>(config.public.authCookieName)

if (!config.public.authEnabled) {
  navigateTo('/')
}

watchEffect(() => {
  if (cookie.value) {
    navigateTo('/')
  }
})

async function onSubmit(): Promise<void> {
  errorMessage.value = ''
  isLoading.value = true
  try {
    await $fetch('/api/auth', {
      method: 'POST',
      body: { key: key.value }
    })
    await navigateTo('/')
  } catch (error) {
    if (error && typeof error === 'object' && 'data' in error) {
      const payload = error.data as { message?: string } | undefined
      errorMessage.value = payload?.message || 'Login failed'
    } else if (error instanceof Error) {
      errorMessage.value = error.message
    } else {
      errorMessage.value = 'Login failed'
    }
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="w-full flex justify-center items-center">
    <UCard class="w-lg">
      <template #header>
        <div class="font-bold">
          Unlock Organic Chat
        </div>
        <div class="text-gray-600 text-sm mt-1">
          Enter your access key to continue.
        </div>
      </template>
      <form
        class="flex flex-col gap-2"
        @submit.prevent="onSubmit"
      >
        <UInput
          v-model="key"
          type="password"
          placeholder="Access key"
          autocomplete="current-password"
          size="lg"
        />
        <UButton
          type="submit"
          color="primary"
          size="lg"
          :loading="isLoading"
          block
        >
          Continue
        </UButton>
        <div
          v-if="errorMessage"
          class="login-error"
        >
          {{ errorMessage }}
        </div>
      </form>
    </UCard>
  </div>
</template>
