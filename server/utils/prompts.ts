import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

let cachedTitlePrompt: string | null = null
let cachedMemoryPrompt: string | null = null

export async function getTitlePrompt(): Promise<string> {
  if (cachedTitlePrompt) return cachedTitlePrompt

  const path = join(process.cwd(), 'server', 'prompts', 'title.md')
  cachedTitlePrompt = await readFile(path, 'utf8')
  return cachedTitlePrompt
}

export async function getMemoryPrompt(): Promise<string> {
  if (cachedMemoryPrompt) return cachedMemoryPrompt

  const path = join(process.cwd(), 'server', 'prompts', 'memory.md')
  cachedMemoryPrompt = await readFile(path, 'utf8')
  return cachedMemoryPrompt
}
