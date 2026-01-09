import { createHighlighter } from 'shiki'
import type { HighlighterGeneric } from 'shiki'
import { createJavaScriptRegexEngine } from 'shiki/engine-javascript.mjs'

let highlighter: HighlighterGeneric<never, never> | null = null
let promise: Promise<HighlighterGeneric<never, never>> | null = null

export const useHighlighter = async () => {
  if (!promise) {
    promise = createHighlighter({
      langs: ['vue', 'js', 'ts', 'css', 'html', 'json', 'yaml', 'markdown', 'bash'],
      themes: ['material-theme-palenight', 'material-theme-lighter'],
      engine: createJavaScriptRegexEngine()
    }) as Promise<HighlighterGeneric<never, never>>
  }
  if (!highlighter) {
    highlighter = await promise
  }

  return highlighter
}
