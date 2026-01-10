import { readFile } from 'node:fs/promises'
import { basename, extname, resolve, sep } from 'node:path'

interface ObsidianFileResponse {
  name: string
  content: string
  mimeType: string
}

function resolveMimeType(extension: string): string {
  switch (extension) {
    case '.md':
      return 'text/markdown'
    case '.txt':
      return 'text/plain'
    case '.json':
      return 'application/json'
    case '.csv':
      return 'text/csv'
    default:
      return 'text/plain'
  }
}

export default defineEventHandler(async (event) => {
  const vaultPath = process.env.OBSIDIAN_VAULT_PATH ?? ''
  if (!vaultPath) {
    throw createError({
      statusCode: 400,
      message: 'Obsidian vault path is not configured.'
    })
  }

  const query = getQuery(event)
  const rawPath = typeof query.path === 'string' ? query.path.trim() : ''
  if (!rawPath) {
    throw createError({
      statusCode: 400,
      message: 'Missing file path.'
    })
  }

  const resolvedRoot = resolve(vaultPath)
  const resolvedFile = resolve(resolvedRoot, rawPath)
  if (resolvedFile !== resolvedRoot && !resolvedFile.startsWith(`${resolvedRoot}${sep}`)) {
    throw createError({
      statusCode: 403,
      message: 'Invalid file path.'
    })
  }

  const extension = extname(resolvedFile).toLowerCase()
  let content = ''
  try {
    content = await readFile(resolvedFile, 'utf8')
  } catch {
    throw createError({
      statusCode: 404,
      message: 'Obsidian file not found.'
    })
  }

  const response: ObsidianFileResponse = {
    name: basename(resolvedFile),
    content,
    mimeType: resolveMimeType(extension)
  }

  return response
})
