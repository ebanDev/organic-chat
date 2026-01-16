import { exec, run } from '../database'

interface UpdateSettingsBody {
  defaultModel?: string | null
  titleModel?: string | null
  memoryModel?: string | null
  taskModel?: string | null
  defaultAgentId?: string | null
  savedModels?: string[]
  assistantToolDefaults?: Record<string, string[]>
}

const UPSERT_SQL = `
  INSERT INTO app_settings (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`

export default defineEventHandler(async (event) => {
  const body = await readBody<UpdateSettingsBody>(event)
  const updates: Array<[string, string]> = []

  if ('defaultModel' in body) {
    updates.push(['default_model', body.defaultModel?.trim() || ''])
  }
  if ('titleModel' in body) {
    updates.push(['title_model', body.titleModel?.trim() || ''])
  }
  if ('memoryModel' in body) {
    updates.push(['memory_model', body.memoryModel?.trim() || ''])
  }
  if ('taskModel' in body) {
    updates.push(['task_model', body.taskModel?.trim() || ''])
  }
  if ('defaultAgentId' in body) {
    updates.push(['default_agent_id', body.defaultAgentId?.trim() || ''])
  }
  if ('savedModels' in body) {
    const clean = Array.isArray(body.savedModels)
      ? body.savedModels.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
    updates.push(['saved_models', JSON.stringify(Array.from(new Set(clean)))])
  }
  if ('assistantToolDefaults' in body) {
    const raw = body.assistantToolDefaults
    let safe: Record<string, string[]> = {}
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      safe = Object.fromEntries(
        Object.entries(raw)
          .filter(([key, value]) => typeof key === 'string' && Array.isArray(value))
          .map(([key, value]) => [
            key,
            Array.from(new Set(
              value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            ))
          ])
      )
    }
    updates.push(['assistant_tool_defaults', JSON.stringify(safe)])
  }

  if (!updates.length) {
    return { ok: true }
  }

  await exec('BEGIN')
  try {
    for (const [key, value] of updates) {
      await run(UPSERT_SQL, [key, value])
    }
    await exec('COMMIT')
  } catch (error) {
    await exec('ROLLBACK')
    throw error
  }

  return { ok: true }
})
