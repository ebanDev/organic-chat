<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const router = useRouter()

const navItems = computed<NavigationMenuItem[][]>(() => [[
  {
    label: 'Providers',
    icon: 'ph:key-bold',
    to: '/settings/providers',
    active: route.path === '/settings/providers'
  },
  {
    label: 'Agents',
    icon: 'ph:user-bold',
    to: '/settings/agents',
    active: route.path === '/settings/agents'
  },
  {
    label: 'Models',
    icon: 'ph:robot-bold',
    to: '/settings/models',
    active: route.path === '/settings/models'
  },
  {
    label: 'Tools',
    icon: 'ph:wrench-bold',
    to: '/settings/tools',
    active: route.path === '/settings/tools'
  },
  {
    label: 'Memory',
    icon: 'ph:brain-bold',
    to: '/settings/memory',
    active: route.path === '/settings/memory'
  },
  {
    label: 'Import',
    icon: 'ph:upload-bold',
    to: '/settings/import',
    active: route.path === '/settings/import'
  }
]])
</script>

<template>
  <UDashboardPanel>
    <template #body>
      <UContainer class="py-8 h-full overflow-y-auto">
        <div class="flex items-center justify-between mb-6 sm:hidden">
          <UButton
            icon="ph:arrow-left-bold"
            color="neutral"
            variant="ghost"
            @click="void router.back()"
          />
          <h1 class="text-lg font-semibold">
            Settings
          </h1>
          <span class="w-9" />
        </div>
        <div class="hidden sm:flex items-center justify-between mb-6">
          <div>
            <h1 class="text-2xl font-bold">
              Settings
            </h1>
            <p class="text-muted">
              Manage your workspace
            </p>
          </div>
        </div>

        <div class="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
          <aside class="rounded-lg border border-default bg-default p-3 h-max">
            <UNavigationMenu
              :items="navItems"
              orientation="vertical"
              variant="pill"
              class="data-[orientation=vertical]:w-full"
            />
          </aside>

          <div class="space-y-6">
            <slot />
          </div>
        </div>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
