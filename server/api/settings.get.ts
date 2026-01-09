import { query } from '../database'

const SETTINGS_KEYS = [
  'default_model',
  'title_model',
  'memory_model',
  'task_model',
  'default_agent_id',
  'saved_models'
] as const

type SettingKey = typeof SETTINGS_KEYS[number]

interface SettingRow {
  key: SettingKey
  value: string
}

export default defineEventHandler(async () => {
  const rows = await query(
    `SELECT key, value FROM app_settings WHERE key IN (${SETTINGS_KEYS.map(() => '?').join(',')})`
  ).all<SettingRow>(...SETTINGS_KEYS)

  const map = new Map(rows.map(row => [row.key, row.value]))
  const savedRaw = map.get('saved_models')
  let savedModels: string[] = []
  if (savedRaw) {
    try {
      const parsed = JSON.parse(savedRaw)
      if (Array.isArray(parsed)) {
        savedModels = parsed.filter((item): item is string => typeof item === 'string')
      }
    } catch {
      savedModels = []
    }
  }

  return {
    defaultModel: map.get('default_model') || null,
    titleModel: map.get('title_model') || map.get('task_model') || null,
    memoryModel: map.get('memory_model') || map.get('task_model') || null,
    defaultAgentId: map.get('default_agent_id') || null,
    savedModels
  }
})
