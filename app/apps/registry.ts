import type { AppDefinition } from '~/apps/types'

const modules = import.meta.glob<{ default: AppDefinition }>(
  '~/pages/apps/**/app.config.ts',
  { eager: true }
)

function toApps(): AppDefinition[] {
  const entries = Object.values(modules)
    .map(module => module.default)
    .filter(Boolean)

  return entries.sort((a, b) => {
    const orderDiff = (a.order ?? 0) - (b.order ?? 0)
    if (orderDiff !== 0) return orderDiff
    return a.name.localeCompare(b.name)
  })
}

export const appsRegistry = toApps()
