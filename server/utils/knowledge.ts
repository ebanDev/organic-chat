import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { query } from '../database'
import type { AgentKnowledgeBaseRow } from '../database/types'

interface KnowledgeBaseContent {
  filePath: string
  content: string
}

export async function loadAgentKnowledgeBase(agentId: string): Promise<KnowledgeBaseContent[]> {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH ?? ''
  if (!vaultPath) {
    return []
  }

  const rows = await query(
    'SELECT * FROM agent_knowledge_base WHERE agent_id = ?'
  ).all<AgentKnowledgeBaseRow>(agentId)

  if (!rows.length) {
    return []
  }

  const resolvedRoot = resolve(vaultPath)
  const contents: KnowledgeBaseContent[] = []

  for (const row of rows) {
    try {
      const resolvedFile = resolve(resolvedRoot, row.file_path)
      if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(`${resolvedRoot}${sep}`)) {
        console.warn('[knowledge] skipping invalid file path', { filePath: row.file_path })
        continue
      }

      const content = await readFile(resolvedFile, 'utf8')
      contents.push({
        filePath: row.file_path,
        content
      })
    } catch (error) {
      console.warn('[knowledge] failed to read file', {
        filePath: row.file_path,
        message: error instanceof Error ? error.message : String(error)
      })
    }
  }

  return contents
}

export function formatKnowledgeBaseContext(contents: KnowledgeBaseContent[]): string {
  if (!contents.length) {
    return ''
  }

  const sections = contents.map(({ filePath, content }) => {
    return `# Knowledge Base: ${filePath}\n\n${content}`
  })

  return `# Agent Knowledge Base\n\nThe following documents are part of your permanent knowledge base. Use them to inform your responses.\n\n${sections.join('\n\n---\n\n')}`
}
