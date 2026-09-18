# AGENTS.md

Single-package Vite + React 19 + TypeScript app. All code lives in `client/` — run all npm commands from there.

## Commands (from `client/`)

- `npm run dev` — local dev server (HMR)
- `npm run build` — typecheck (`tsc -b`) + production build; always run before considering work done
- `npm run lint` — ESLint (`eslint .`)
- `npm run preview` — preview the production build

No test runner, CI, or formatting script configured. No `test` script — do not add one unprompted.

## Structure

- `client/index.html` → `client/src/main.tsx` → `client/src/App.tsx` — entry flow
- `client/src/` — only application source (`App.tsx`, `App.css`, `index.css`, `assets/`)
- `client/public/` — static assets served at root (`/icons.svg`, `/favicon.svg`)
- `client/vite.config.ts` — plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`

## Gotchas

- `npm run build` fails on unused locals/params (`noUnusedLocals`, `noUnusedParameters` in `tsconfig.app.json`). Remove dead code rather than prefixing with `_` unless it's a required signature.
- `verbatimModuleSyntax` + `erasableSyntaxOnly` are on: use `import type` for type-only imports; no enums, namespaces, or parameter properties.
- Tailwind v4 (no config file): styling enters via `@import "tailwindcss"` in `src/index.css` plus the Vite plugin. Do not add `tailwind.config.js` / `postcss.config.js`.
- Installed but currently unused deps (`@monaco-editor/react`, `framer-motion`, `lucide-react`, `clsx`, `tailwind-merge`) — prefer them over adding new libraries for editor UI, animation, icons, or class merging.
