import { appsRegistry } from '~/apps/registry'
import type { AppDefinition } from '~/apps/types'

export function useApps() {
  const apps = computed<AppDefinition[]>(() => appsRegistry)

  return {
    apps
  }
}
