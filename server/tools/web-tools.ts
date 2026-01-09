import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { ToolRow } from '../database/types'

const urlSchema = z.union([z.string().url(), z.array(z.string().url()).min(1).max(20)])

export function createWebTools(options: {
  google?: ToolRow | null
  tavily?: ToolRow | null
}): ToolSet {
  const tools = {} as ToolSet

  if (options.google) {
    tools.web_search = tool({
      description: 'Search the web for up-to-date information using Google Programmable Search Engine.',
      inputSchema: z.object({
        query: z.string().describe('Search query to look up on the web.'),
        maxResults: z.number().min(1).max(5).optional().default(5)
      }),
      execute: async ({ query, maxResults }: { query: string, maxResults: number }) => {
        if (!options.google?.api_key || !options.google?.engine_id) {
          return { query, results: [], error: 'Web search is not configured' }
        }
        const limit = Math.min(5, Math.max(1, maxResults ?? 5))
        const params = new URLSearchParams({
          key: options.google?.api_key ?? '',
          cx: options.google?.engine_id ?? '',
          q: query,
          num: String(limit)
        })

        try {
          const response = await fetch(`https://www.googleapis.com/customsearch/v1?${params.toString()}`)
          if (!response.ok) {
            return { query, results: [], error: `Search failed with status ${response.status}` }
          }
          const data = await response.json() as {
            items?: Array<{
              title?: string
              link?: string
              snippet?: string
              displayLink?: string
            }>
          }
          const results = (data.items ?? []).map(item => ({
            title: item.title ?? '',
            url: item.link ?? '',
            snippet: item.snippet ?? '',
            source: item.displayLink ?? ''
          }))
          return { query, results }
        } catch (error) {
          return { query, results: [], error: error instanceof Error ? error.message : String(error) }
        }
      }
    })
  }

  if (options.tavily) {
    tools.web_read = tool({
      description: 'Extract web page content from one or more URLs using Tavily Extract.',
      inputSchema: z.object({
        urls: urlSchema.describe('One URL or a list of URLs to extract content from.'),
        query: z.string().optional().describe('Optional intent for reranking extracted chunks.'),
        chunksPerSource: z.number().min(1).max(5).optional(),
        extractDepth: z.enum(['basic', 'advanced']).optional(),
        includeImages: z.boolean().optional(),
        includeFavicon: z.boolean().optional(),
        format: z.enum(['markdown', 'text']).optional(),
        timeout: z.number().min(1).max(60).optional()
      }),
      execute: async ({
        urls,
        query,
        chunksPerSource,
        extractDepth,
        includeImages,
        includeFavicon,
        format,
        timeout
      }: {
        urls: string | string[]
        query?: string
        chunksPerSource?: number
        extractDepth?: 'basic' | 'advanced'
        includeImages?: boolean
        includeFavicon?: boolean
        format?: 'markdown' | 'text'
        timeout?: number
      }) => {
        if (!options.tavily?.tavily_api_key) {
          return { error: 'Web read is not configured' }
        }
        const payload = {
          urls,
          query,
          chunks_per_source: chunksPerSource,
          extract_depth: extractDepth,
          include_images: includeImages,
          include_favicon: includeFavicon,
          format,
          timeout
        }

        try {
          const response = await fetch('https://api.tavily.com/extract', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${options.tavily?.tavily_api_key ?? ''}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
          })

          if (!response.ok) {
            const text = await response.text()
            return { error: `Extract failed with status ${response.status}`, detail: text }
          }

          const data = await response.json() as {
            results?: Array<{
              url?: string
              raw_content?: string
              images?: string[]
              favicon?: string
            }>
            failed_results?: Array<{ url?: string, error?: string }>
            response_time?: number
            usage?: { credits?: number }
            request_id?: string
          }

          return {
            results: (data.results ?? []).map(result => ({
              url: result.url ?? '',
              content: result.raw_content ?? '',
              images: result.images ?? [],
              favicon: result.favicon ?? null
            })),
            failedResults: (data.failed_results ?? []).map(result => ({
              url: result.url ?? '',
              error: result.error ?? ''
            })),
            responseTime: data.response_time ?? null,
            usage: data.usage ?? null,
            requestId: data.request_id ?? null
          }
        } catch (error) {
          return { error: error instanceof Error ? error.message : String(error) }
        }
      }
    })
  }

  return tools
}
