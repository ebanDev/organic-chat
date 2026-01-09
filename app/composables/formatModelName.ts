export function formatModelName(modelId: string): string {
  const acronyms = ['gpt']
  return modelId
    .split('-')
    .map((part) => {
      const lower = part.toLowerCase()
      if (acronyms.includes(lower)) return lower.toUpperCase()
      return part.charAt(0).toUpperCase() + part.slice(1)
    })
    .join(' ')
}
