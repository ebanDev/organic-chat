# Organic Chat

A Nuxt UI layer with curated tokens, polished defaults, and ready-to-ship page patterns. Built to spin up Nuxt apps quickly without sacrificing taste.

## Features
- Nuxt 4 + Nuxt UI with pre-rendered home route.
- TypeScript, ESLint, and strict typing enabled by default.
- Tailwind-based design tokens with opinionated sizing and spacing.
- Handy starter sections (hero, features, CTA) wired to Nuxt UI primitives.

## Getting started

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

## Scripts
- `pnpm dev` — start the dev server with HMR.
- `pnpm build` — production build.
- `pnpm preview` — preview the production build locally.
- `pnpm lint` — run ESLint.
- `pnpm typecheck` — run TypeScript checks.

## Project structure
- `app/` — application entry, pages, components, and UI config.
- `app/assets/css/main.css` — global styles and Tailwind entrypoint.
- `nuxt.config.ts` — Nuxt configuration and module setup.
- `eslint.config.mjs` — linting rules (stylistic enforced).

## Apps
Apps are small, task-specific experiences that sit alongside chat.

**Where they live**
- `app/pages/apps/<appName>/index.vue` — full page for the app (`/apps/<appName>`).
- `app/pages/apps/<appName>/app.config.ts` — app metadata (name, icon, widget, route).
- `app/apps/<appName>/Widget.vue` — optional widget shown on `/` and the sidebar entry.

**How discovery works**
- `app/apps/registry.ts` auto-loads all `app.config.ts` files and powers the homepage widgets and sidebar list.

**Add a new app**
1. Create the page at `app/pages/apps/<appName>/index.vue`.
2. Add `app/pages/apps/<appName>/app.config.ts`.
3. (Optional) Create a widget at `app/apps/<appName>/Widget.vue` and reference it in the config.

**Shared inference endpoint**
- `POST /api/apps/infer`
- Body: `{ prompt: string, providerId: string, model?: string }`
- Response: `{ text: string }`

## Deployment
Build and serve the generated `.output` directory or deploy with your preferred Nuxt-compatible host. See the [Nuxt deployment docs](https://nuxt.com/docs/getting-started/deployment) for provider-specific steps.
