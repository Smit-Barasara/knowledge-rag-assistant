# Frontend notes

## Decisions & deviations from FRONTEND_BUILD_GUIDE.md
- 2026-11-18: Used React Router 7 and Vite 8, the current stable releases available during setup.
- 2026-11-18: Tailwind is configured as requested, while the shipped responsive surfaces use CSS custom properties and component styles for fine-grained layouts.
- 2026-11-18: Python 3.14 on the workstation cannot import an existing gRPC wheel due to Windows Application Control; backend gates were run in the repository's Python 3.12 Docker image.
- 2026-11-18: The SSE reader normalizes CRLF across chunk boundaries and ignores malformed JSON events; the backend currently emits LF-only events.
- 2026-11-18: Browser mock tests use Playwright route interception rather than a separate mock-server process; responses remain isolated from live APIs and require no keys.

## Dependencies added (justification)
- Vite, React, TypeScript: static SPA build and strict typed UI.
- React Router, TanStack Query, Zustand, Zod: routes, cancellable cached API state, persisted browser-only conversations/settings, and runtime API validation.
- React Markdown and remark-gfm: safe Markdown rendering without raw HTML.
- Radix Dialog and Lucide React: accessible explorer detail dialog and compact icons.
- Tailwind/PostCSS: utility CSS processing; most page styling uses local CSS tokens for responsive layout.
- Vitest, Testing Library, MSW, Playwright, axe: mocked API/unit coverage, browser smoke tests, and accessibility checks.
- ESLint/typescript-eslint/jsx-a11y/Prettier: strict linting, accessibility rules, and formatting.

## Backend changes applied (B1–B5 + any optional) with commit hashes
- B1–B5 applied and tested in `b96015a` (`feat(api): add frontend contracts and filters`).

## Known limitations
- AI requests require valid Anthropic and Voyage API keys and populated Qdrant data; no keys are embedded in the frontend.
- The compose overlay expects a local root `.env` file, which is intentionally not committed.
- Agent and Corrective-RAG calls are non-streaming; the browser can stop waiting, but the backend may continue processing.
- The manual real-backend QA and Lighthouse targets require configured keys, ingested data, and a production deployment.

## Verified versions (Node, npm, key libs)
- Node: v26.9.0; npm: 11.19.1.
- React 19.3.1, Vite 8.3.6, TypeScript 5.9.3, React Router 7.18.5.
