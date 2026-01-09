# AGENTS.md

AI coding agents working on this project must follow these guidelines.

## Project Overview

A Nuxt-based AI chat application. The goal is senior-level code quality with three core principles:

1. **KISS** - Keep It Simple, Stupid. No over-engineering.
2. **FAST** - Performance is a feature. Optimize for speed.
3. **ROBUST** - Handle errors gracefully. Fail loudly, recover quietly.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Nuxt | 4.x |
| UI | NuxtUI | 4.3+ |
| State | Pinia + pinia-plugin-persistedstate | latest |
| LLM | Vercel AI SDK | 6.x |
| Database | bun:sqlite + sqlite-vector | native |
| Icons | Phosphor Icons | via @iconify-json/ph |
| Runtime | Bun | native |

## Documentation

Reference docs are available in `.agents/docs/`:

- **AI SDK v6** - Vercel AI SDK documentation
- **NuxtUI** - NuxtUI v4 component documentation

Consult these docs for API details, component props, and usage patterns.

## Core Principles

### Nuxt-Native First

Always prefer Nuxt's built-in features:

- `useFetch` / `useAsyncData` for data fetching
- `useRuntimeConfig` for environment variables
- Auto-imports for components, composables, utils
- File-based routing in `app/pages/`
- Server routes in `server/api/`

Use Pinia stores with persisted state for client data and cache. Keep the store data as the single source of truth for UI state, then sync to the server via API calls.

### NuxtUI Components

Use NuxtUI v4.3 components exclusively for UI. Key chat components:

```vue
<UChatMessages :messages="messages" />
<UChatMessage :message="message" />
<UChatPrompt v-model="input" @submit="send" />
<UChatPromptSubmit :loading="isLoading" />
<UChatPalette :commands="commands" />
```

Never build custom components when NuxtUI provides one. NuxtUI components are:
- Already styled with the design system
- Accessible by default
- Optimized for performance

### BYOK (Bring Your Own Key) Architecture

Users provide their own API keys. Keys are stored in Pinia persisted state and duplicated in the server database for streaming and resumability.

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│   Server    │────▶│  Provider   │
│ (keys ok)   │     │  (has keys) │     │  (OpenAI,   │
│             │◀────│  streaming  │◀────│   Claude)   │
└─────────────┘     └─────────────┘     └─────────────┘
```

**Why server-side completions:**
- Stream resumability on connection drops
- Centralized rate limiting
- Request/response logging

### Vercel AI SDK v6

Use the AI SDK for all LLM interactions at the server level:

```ts
// server/api/chat.post.ts
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

export default defineEventHandler(async (event) => {
  const { messages, conversationId } = await readBody(event)

  // Get user's API key from database
  const apiKey = await getApiKey(conversationId)

  const openai = createOpenAI({ apiKey })

  const result = streamText({
    model: openai('gpt-4o'),
    messages
  })

  return result.toDataStreamResponse()
})
```

Client-side usage with `useChat`:

```ts
const { messages, input, handleSubmit, isLoading } = useChat({
  api: '/api/chat',
  body: { conversationId }
})
```

### Bun SQLite

Use Bun's native SQLite (`bun:sqlite`) for maximum performance:

```ts
// server/database/index.ts
import { Database } from 'bun:sqlite'

const db = new Database('server/db/chat.db', { create: true })
db.exec('PRAGMA journal_mode = WAL')

export { db }
```

```
server/
  database/
    index.ts      # db connection + migrations
  db/
    chat.db       # SQLite file (gitignored)
shared/
  db/
    schema.ts     # single schema source of truth
```

Schema with BYOK support:

```ts
// shared/db/schema.ts
// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    api_key TEXT NOT NULL,
    base_url TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );
`)
```

## Directory Structure

```
.agents/
  docs/           # AI agent reference docs
    ai-sdk/       # Vercel AI SDK v6 docs
    nuxtui/       # NuxtUI v4 docs

app/
  components/     # Vue components (auto-imported)
  composables/    # Vue composables (auto-imported)
  stores/         # client data access wrappers
  pages/          # File-based routing
  layouts/        # Layout components
  assets/
    css/
      main.css    # Global styles, Tailwind
  app.vue         # Root component
  app.config.ts   # UI configuration

server/
  api/            # API routes
    chat.post.ts  # Chat streaming endpoint
    providers/    # Provider CRUD
    conversations/# Conversation CRUD
  database/       # Database layer
    index.ts
    schema.ts
  utils/          # Server utilities
    encryption.ts # API key encryption

public/           # Static assets
nuxt.config.ts    # Nuxt configuration
```

## Apps

Apps are mini experiences that ship alongside chat.

- Store full app pages in `app/pages/apps/<appName>/index.vue`.
- Add an app definition in `app/pages/apps/<appName>/app.config.ts` so it appears on the home widgets and sidebar.
- Keep widgets lightweight; they render on `/` and should load quickly.
- Apps must use the existing BYOK flow and server APIs (no direct client-to-provider calls).
- Use `POST /api/apps/infer` for app-level completions (no conversation creation).

## Code Style

### TypeScript

- Strict mode enabled
- Explicit types for function parameters and returns
- Use `satisfies` for type checking without widening
- Prefer interfaces over types for objects

```ts
// Good
function sendMessage(content: string): Promise<Message> { ... }

// Avoid
function sendMessage(content) { ... }
```

### Vue Components

- Use `<script setup>` exclusively
- Props with TypeScript types via `defineProps<T>()`
- Emit with typed events via `defineEmits<T>()`
- Keep components small and focused

```vue
<script setup lang="ts">
interface Props {
  message: Message
  showTimestamp?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showTimestamp: true
})
</script>
```

### Client State

Use Pinia stores for all client-side state. Persist via `pinia-plugin-persistedstate` and keep store APIs minimal.

### Error Handling

Handle errors at the boundary, not everywhere:

```ts
// server/api/chat.post.ts
export default defineEventHandler(async (event) => {
  try {
    // ... logic
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: 'Failed to process chat request'
    })
  }
})
```

Client-side, use `useChat`'s built-in error handling:

```ts
const { error, reload } = useChat({
  onError: (err) => {
    toast.add({ title: 'Error', description: err.message })
  }
})
```

## Performance Guidelines

1. **Stream responses** - Always use `streamText` for LLM responses
2. **Lazy load** - Use `lazy: true` for non-critical data
3. **Debounce input** - Debounce user input to reduce API calls
4. **Virtual scrolling** - For long message lists (NuxtUI handles this)
5. **Prerender static pages** - Use `routeRules` for static content

## Security

- Validate all user input on the server
- Sanitize LLM output before rendering
- Rate limit API endpoints per provider

## Git Conventions

Commit messages follow conventional commits:

```
feat: add conversation history
fix: resolve streaming timeout issue
refactor: simplify message state management
```

## Schema Source of Truth

- Declare database tables and indexes once in `shared/db/schema.ts`
- Server uses the shared schema for initialization and migrations

## What NOT to Do

- Don't create custom fetch wrappers - use `useFetch`
- Don't build UI components from scratch - use NuxtUI
- Don't over-abstract - three similar lines > premature abstraction
- Don't add unused dependencies
- Don't write comments for obvious code
- Don't add backwards-compatibility shims - just change the code
