import { readdir, stat } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { extname, basename, relative, resolve } from 'node:path'

interface ObsidianSearchResult {
  name: string
  relativePath: string
  extension: string
  modifiedAt?: number
}

const MAX_RESULTS = 25
const DEFAULT_RESULTS = 5

async function searchVault(root: string, query: string): Promise<ObsidianSearchResult[]> {
  const results: ObsidianSearchResult[] = []
  const stack = [root]
  const needle = normalizeSearchValue(query)
  if (!needle) return results

  while (stack.length && results.length < MAX_RESULTS) {
    const current = stack.pop()
    if (!current) continue
    let entries: Dirent[]
    try {
      entries = await readdir(current, { withFileTypes: true }) as Dirent[]
    } catch {
      continue
    }

    for (const entry of entries) {
      if (results.length >= MAX_RESULTS) break
      const entryName = entry.name
      if (entryName.startsWith('.')) continue
      const fullPath = resolve(current, entryName)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (entry.isSymbolicLink()) continue
      if (!entry.isFile()) continue
      const extension = extname(entryName).toLowerCase()
      if (extension !== '.md') continue
      const base = basename(entryName, extension)
      const normalizedBase = normalizeSearchValue(base)
      if (!matchesFuzzy(normalizedBase, needle)) continue

      results.push({
        name: entryName,
        relativePath: relative(root, fullPath),
        extension
      })
    }
  }

  return results
}

function normalizeSearchValue(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]/g, '')
}

function matchesFuzzy(haystack: string, needle: string): boolean {
  if (!needle) return false
  if (haystack.includes(needle)) return true
  if (isSubsequence(haystack, needle)) return true
  const distance = limitedLevenshtein(haystack, needle, maxDistanceForNeedle(needle.length))
  return distance !== null
}

function isSubsequence(haystack: string, needle: string): boolean {
  let index = 0
  for (const char of haystack) {
    if (char === needle[index]) {
      index += 1
      if (index >= needle.length) return true
    }
  }
  return false
}

function maxDistanceForNeedle(length: number): number {
  if (length <= 4) return 1
  if (length <= 7) return 2
  return 3
}

function limitedLevenshtein(a: string, b: string, maxDistance: number): number | null {
  const lengthDiff = Math.abs(a.length - b.length)
  if (lengthDiff > maxDistance) return null
  const v0 = new Array(b.length + 1).fill(0)
  const v1 = new Array(b.length + 1).fill(0)

  for (let i = 0; i <= b.length; i += 1) {
    v0[i] = i
  }

  for (let i = 0; i < a.length; i += 1) {
    v1[0] = i + 1
    let rowMin = v1[0]
    const aChar = a[i]
    for (let j = 0; j < b.length; j += 1) {
      const cost = aChar === b[j] ? 0 : 1
      const next = Math.min(
        v1[j] + 1,
        v0[j + 1] + 1,
        v0[j] + cost
      )
      v1[j + 1] = next
      if (next < rowMin) rowMin = next
    }
    if (rowMin > maxDistance) return null
    for (let j = 0; j <= b.length; j += 1) {
      v0[j] = v1[j]
    }
  }

  const distance = v0[b.length]
  return distance <= maxDistance ? distance : null
}

async function getRecentFiles(root: string): Promise<ObsidianSearchResult[]> {
  const stack = [root]
  const candidates: ObsidianSearchResult[] = []

  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    let entries: Dirent[]
    try {
      entries = await readdir(current, { withFileTypes: true }) as Dirent[]
    } catch {
      continue
    }

    for (const entry of entries) {
      const entryName = entry.name
      if (entryName.startsWith('.')) continue
      const fullPath = resolve(current, entryName)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (entry.isSymbolicLink()) continue
      if (!entry.isFile()) continue
      const extension = extname(entryName).toLowerCase()
      if (extension !== '.md') continue
      let stats
      try {
        stats = await stat(fullPath)
      } catch {
        continue
      }
      candidates.push({
        name: entryName,
        relativePath: relative(root, fullPath),
        extension,
        modifiedAt: stats.mtimeMs
      })
    }
  }

  return candidates
    .sort((a, b) => (b.modifiedAt ?? 0) - (a.modifiedAt ?? 0))
    .slice(0, DEFAULT_RESULTS)
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
  const raw = typeof query.q === 'string' ? query.q.trim() : ''
  if (!raw) {
    const resolvedRoot = resolve(vaultPath)
    const results = await getRecentFiles(resolvedRoot)
    return { results }
  }

  const resolvedRoot = resolve(vaultPath)
  const results = await searchVault(resolvedRoot, raw)

  return {
    results
  }
})
