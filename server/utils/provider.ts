const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'

export function resolveProviderBaseUrl(baseUrl?: string | null): string {
  if (!baseUrl?.trim()) {
    return DEFAULT_OPENAI_BASE_URL
  }

  const cleaned = baseUrl.trim().replace(/\/+$/, '')
  if (cleaned.endsWith('/v1') || cleaned.includes('/v1/')) {
    return cleaned
  }

  return `${cleaned}/v1`
}

function createSseFilterStream() {
  let buffer = ''
  let reasoningActive = false
  let pendingClose = false

  return new TransformStream<string, string>({
    transform(chunk, controller) {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) {
          controller.enqueue(`${line}\n`)
          continue
        }

        const payload = line.slice(6)
        if (payload === '[DONE]') {
          controller.enqueue(`${line}\n`)
          continue
        }

        try {
          const data = JSON.parse(payload) as Record<string, unknown>

          if (data['x-model'] && !('choices' in data) && !('error' in data)) {
            continue
          }

          const choices = data.choices as Array<{ delta?: Record<string, unknown> }> | undefined
          const delta = choices?.[0]?.delta

          if (delta && typeof delta === 'object' && 'reasoning' in delta) {
            const reasoningText = typeof delta.reasoning === 'string' ? delta.reasoning : ''
            if (reasoningText) {
              const prefix = reasoningActive ? '' : '<thinking>'
              delta.content = `${prefix}${reasoningText}`
              reasoningActive = true
              pendingClose = false
            } else if (reasoningActive) {
              pendingClose = true
              reasoningActive = false
            }

            delete delta.reasoning
            delete delta.reasoning_details
          }

          if (pendingClose && delta && typeof delta === 'object' && 'content' in delta) {
            const content = typeof delta.content === 'string' ? delta.content : ''
            if (content) {
              delta.content = `</thinking>${content}`
              pendingClose = false
            }
          }

          controller.enqueue(`data: ${JSON.stringify(data)}\n`)
        } catch {
          controller.enqueue(`${line}\n`)
        }
      }
    },
    flush(controller) {
      if (buffer) {
        controller.enqueue(buffer)
      }
    }
  })
}

export const openAIStreamFilterFetch = Object.assign(
  async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const response = await fetch(input, init)
    const contentType = response.headers.get('content-type') || ''

    if (!response.ok || !contentType.includes('text/event-stream') || !response.body) {
      return response
    }

    const filtered = response.body
      .pipeThrough(new TextDecoderStream())
      .pipeThrough(createSseFilterStream())
      .pipeThrough(new TextEncoderStream())

    return new Response(filtered, {
      status: response.status,
      headers: response.headers
    })
  },
  {
    preconnect: fetch.preconnect?.bind(fetch)
  }
) as typeof fetch
