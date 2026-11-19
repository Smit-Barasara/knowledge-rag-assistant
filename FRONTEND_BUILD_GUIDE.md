# FRONTEND_BUILD_GUIDE.md

> **Audience:** an AI coding agent (Claude Code, Cursor, Copilot agent, etc.) working inside the
> `knowledge-rag-assistant` repository.
> **Goal:** build a production-quality, deploy-ready React frontend for the existing FastAPI backend,
> making only small, additive, test-covered backend changes — **without breaking anything that works today.**
>
> Read this whole file before writing code. Sections 2 and 4 are binding rules, not suggestions.

---

## 0. How to use this document

1. Read §1–§3 to understand the goal, the rules, and what the backend really does (verified by reading the code, not just the README).
2. Run the **baseline** (§4.1) and record the result. You must end with *at least* that many passing tests.
3. Apply the validated backend patch (§4.2), then build the frontend phase by phase (§10). Each phase has a **gate**; do not start the next phase until the gate passes.
4. When something in this file conflicts with what you observe in the code, **the code wins** — stop, note the discrepancy in `docs/FRONTEND_NOTES.md`, and choose the option that changes the least.

Companion file: `backend-additive.patch` (delivered with this guide). It is a `git apply`-able diff of every
backend change in §4.2 **plus its tests**. It was validated on a pristine clone: baseline 21 tests passed → 31 passed after the patch.

---

## 1. Mission, scope, definition of done

### 1.1 What exists
A FastAPI RAG backend over a Digimon knowledge base (data from DAPI → Voyage embeddings → Qdrant + PostgreSQL;
Claude Haiku for generation; Redis for cache + chat memory; Langfuse for tracing). It has **no UI**.
Three "brains" are exposed side by side: custom RAG (`/chat`, `/chat/stream`), a PydanticAI tool-calling agent (`/agent`),
and a LangGraph Corrective-RAG graph (`/agent/graph`).

### 1.2 What to build
A single-page React app in `frontend/` with:

| Area | Summary |
|---|---|
| **Chat** | Streaming multi-turn chat with source citations, filters, stop/retry, local history, three selectable "modes" (Standard RAG / Agent / Corrective RAG). |
| **Explorer** | Browse/search/filter the ingested Digimon (cards, pagination, detail drawer) with an "Ask about this Digimon" hand-off to Chat. |
| **How it works** | A short, honest explanation of the architecture (this is a portfolio piece; it should showcase the backend). |
| **System status** | Live backend health indicator + graceful degraded/offline states. |
| **Polish** | Light/dark theme, responsive (mobile-first), WCAG 2.1 AA accessibility, keyboard support, empty/loading/error states everywhere. |
| **Delivery** | Dockerfile + nginx (SPA + SSE-safe `/api` proxy), compose overlay, CI workflow, README section, tests. |

### 1.3 Definition of done (all must be true)
- [ ] `make test` (backend) is green; test count ≥ baseline (+10 with the patch).
- [ ] `cd frontend && npm run lint && npm run typecheck && npm run test && npm run build` all pass with **zero warnings treated as errors**.
- [ ] Playwright e2e smoke suite passes against a **mocked** backend (no API keys needed).
- [ ] Manual QA script (§11) passes against the **real** backend with ingested data.
- [ ] `docker compose -f docker-compose.yml -f docker-compose.app.yml up --build` (from `docker/`) serves the UI on `:8080` and chat streaming works through nginx.
- [ ] Lighthouse (mobile, production build): Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95.
- [ ] No secrets in the frontend bundle; no `dangerouslySetInnerHTML`; CSP in place.
- [ ] `README.md` has a Frontend section; `docs/FRONTEND_NOTES.md` lists every deviation from this guide.

### 1.4 Out of scope (do **not** build)
Authentication/user accounts, payments, admin/ingestion UI, i18n, a custom design system from scratch,
server-side rendering, or any change to the RAG logic itself.

---

## 2. Non-negotiable rules — "do not break the app"

These exist because this backend has several non-obvious coupling points. Violating them silently degrades
answer quality or breaks tests.

### 2.1 Backend rules

1. **Additive only.** You may add endpoints, add *optional* request params, and add *new* response fields/SSE events.
   You may **never** rename or remove a field, change a field's type, change an existing status code, or change the
   shape of an existing error (`{"detail": "..."}`).
2. **One change at a time.** After *each* backend change run `make test`. Never batch ten edits and debug later.
3. **Frozen files/behaviour — do not edit:**
   - `PromptBuilder.SYSTEM_PROMPT` in `app/rag/prompt_builder.py` — shared by `/chat`, `/chat/stream` **and** the RAGAS eval script; any wording change shifts the published eval scores (faithfulness 1.000, answer_relevancy 0.848, …).
   - `app/rag/retriever.py`, `app/db/qdrant.py` (score threshold 0.5, limit 5), `app/agents/graph/*` logic, `app/guardrails/input_guard.py` logic.
   - `app/ingestion/*` and `scripts/*` (ingestion + RAGAS eval). Embedding `input_type` handling in particular.
   - The Qdrant payload schema (`digimon_id, name, chunk_index, chunk_text, level, type, attribute`) and the Postgres tables. **No schema migrations** (the repo uses `create_all`, there are no Alembic migrations).
   - Redis key formats `conv:{conversation_id}` and `chat:{query_hash}:{filters_hash}`; TTLs (1 h history, 24 h cache); `MAX_HISTORY_TURNS = 5`.
   - `tests/conftest.py`: the `mock_settings` fixture must remain **session-scoped + autouse** (`app/agents/pydantic_agent.py` calls `get_settings()` at import time).
4. **Test conventions (from the repo's own `CLAUDE.md`):** patch dependencies at the **import site**
   (`patch("app.api.routes.digimon.PostgresManager")`, not `app.db.postgres.PostgresManager`). Tests must be fully mocked — no network, no live services, no API keys.
5. **No new required env vars.** New settings need safe defaults that preserve today's behaviour (e.g. `CORS_ORIGINS="*"`).
6. **Route order matters in FastAPI.** `GET /api/v1/digimon/filters` must be declared **before** `GET /api/v1/digimon/{digimon_id}` or `"filters"` is parsed as an int and returns 422.
7. **Don't run long jobs synchronously.** `make ingest` (~5 min) and `python scripts/evaluate_rag.py` (~55–60 min) are bottlenecked by Voyage's free tier (3 RPM). You do **not** need to run either to build the frontend. If ingestion is needed for manual QA, run it in the background and poll; if you hit `RateLimitError`, wait ~60 s.
8. **Never commit `.env`** or real keys. Only edit `.env.example` (add new vars with safe defaults).

### 2.2 Frontend rules

1. All code in `frontend/`. The only files you may touch outside it: those listed in §4.2, `docker/docker-compose.app.yml` (new), `.github/workflows/frontend.yml` (new), `README.md` (append a section), `.env.example` (append `CORS_ORIGINS`), `.gitignore`/`.dockerignore` (append frontend entries).
2. **Do not modify** `.github/workflows/ci.yml` or `docker/docker-compose.yml` (existing infra). Use new files/overlays.
3. TypeScript `strict: true`, no `any` (use `unknown` + zod parsing at the API boundary).
4. **No secrets, no API keys** in the frontend. `VITE_*` variables are public by definition.
5. Never render model output as HTML. Markdown only, via a sanitizing renderer (§6.1.6).
6. Never invent data. If the backend doesn't return a field (e.g. per-token usage on agent graph), the UI doesn't show it.
7. Every network call has: a timeout/abort path, an error state, and a retry affordance.
8. No dependency without justification in `docs/FRONTEND_NOTES.md`. Pin exact versions in `package-lock.json` (commit it).

---

## 3. Backend deep-dive (verified from source)

### 3.1 Architecture in one picture

```
Browser (React)
   │  HTTPS  /api/v1/*  (nginx proxies; SSE must not be buffered)
   ▼
FastAPI  app/api/main.py   (CORS: allow_origins ["*"], no credentials)
   ├── /chat, /chat/stream  ── custom RAG ──┐
   ├── /agent               ── PydanticAI ──┤   Retriever → Voyage embed(query) → Qdrant (top 5, score ≥ 0.5)
   ├── /agent/graph         ── LangGraph ───┤   PromptBuilder → Claude Haiku (LLMClient)
   ├── /digimon, /digimon/{id}  (Postgres)  │
   └── /health                              │
Redis: chat memory (conv:{id}, last 5 turns, 1 h TTL) + response cache (fresh sessions only, 24 h)
Langfuse: traces; async LLM-as-judge scores on /chat only
```

### 3.2 Request lifecycles (what happens, in order)

**`POST /api/v1/chat`** (non-streaming)
1. `conversation_id = request.conversation_id or new uuid4`. Load history from Redis (`conv:{id}`), trim to last 10 messages.
2. **Cache check only if history is empty** (key = sha256(query) + md5(filters)). Hit → returns immediately with the *new* `conversation_id` and fresh `latency_ms`.
3. If history exists: **contextualize** the follow-up with an LLM call ("What are its skills?" → "What are Agumon's skills?"). Falls back to raw query on error.
4. **Guardrail** (LLM YES/NO classifier on the contextualized query). `NO` → **HTTP 400** `{"detail": OFF_TOPIC_MESSAGE}`. Fail-open on LLM error.
5. Embed query (Voyage) → Qdrant search (limit 5, threshold 0.5, optional `level`/`type` payload filters).
6. Build context message; call Claude with history + `SYSTEM_PROMPT`.
7. Save `[..., user(query), assistant(answer)]` to Redis (1 h TTL), trace to Langfuse, schedule LLM-judge in a background task, cache the response (fresh sessions only).

**`POST /api/v1/chat/stream`** (SSE) — same as above steps 1, 3–6 but **no cache, no judge**. Guardrail + retrieval run *before* the `StreamingResponse` is created, so an off-topic query is a plain **HTTP 400 JSON** response, *not* an SSE event. History is persisted **only when the stream completes** (`done`).

**`POST /api/v1/agent`** — guardrail → PydanticAI agent with 4 tools (`rag_search`, `get_digimon_by_name`, `get_digimon_by_level`, `get_digimon_skills`). **Ignores `conversation_id`** (accepted but unused; no memory). Non-streaming; typically several seconds.

**`POST /api/v1/agent/graph`** — guardrail → LangGraph: `retrieve → grade → (generate | rewrite → retrieve)`, max 2 rewrites. **No memory, no filters.** Non-streaming.

### 3.3 API contract (exact)

Base path: `/api/v1`. All bodies JSON. Types below are TypeScript; `?` = optional.

| Method & path | Request | Success response |
|---|---|---|
| `POST /chat` | `{ query: string(1..2000); conversation_id?: string; level_filter?: string; type_filter?: string }` | `{ response: string; conversation_id: string; context_sources: {digimon_id: number\|null; name: string\|null; score: number\|null}[]; token_usage: {prompt_tokens; completion_tokens; total_tokens}; latency_ms: number }` |
| `POST /chat/stream` | same as `/chat` | `text/event-stream` (§3.4) |
| `POST /agent` | `{ query: string; conversation_id?: string }` *(id ignored)* | `{ response: string; tool_calls: string[]; usage: {input_tokens; output_tokens; total_tokens}; latency_ms: number }` |
| `POST /agent/graph` | `{ query: string }` | `{ response: string; iterations: 0\|1\|2; documents_used: number; latency_ms: number }` (+ `rewritten_query?: string\|null` after patch B4) |
| `GET /digimon?limit&offset` | `limit` 1..100 (default 10), `offset` ≥ 0 | `{id; name; level; type}[]` (+ `attribute`, `image_url`, `X-Total-Count` header, and `q/level/type/attribute` params after patch B2) |
| `GET /digimon/{id}` | – | `{id; name; level; type; attribute; description; image_url}` · 404 `Digimon not found` |
| `GET /digimon/filters` *(new, B3)* | – | `{ levels: string[]; types: string[]; attributes: string[] }` |
| `GET /health` | – | `{ status: "healthy"; message: string }` (shallow: process is up; does **not** check Qdrant/Redis/Postgres) |

Notes that bite:
- **Two different usage shapes:** `/chat` → `prompt_tokens/completion_tokens/total_tokens`; `/agent` → `input_tokens/output_tokens/total_tokens`. Normalize in the API layer.
- `AgentRequest.query` and `GraphRequest.query` have **no server-side max length**; `ChatRequest.query` is capped at 2000. Enforce 2000 client-side everywhere.
- `level_filter`/`type_filter` are **exact-match** against Qdrant payload (`level`, `type`). Values must come from the real data → use `/digimon/filters`, never hard-code (a static fallback list is allowed only when that call fails: Fresh, In-Training, Rookie, Champion, Ultimate, Mega).
- Filters apply to `/chat` and `/chat/stream` **only**.
- `context_sources` can contain several entries for the same Digimon (one per matching chunk). Dedupe by `digimon_id`, keep the highest `score`. Scores are cosine similarity, floor 0.5.
- `/agent` `tool_calls` is a flat list of tool names and can contain duplicates and non-tool parts; dedupe with counts, show only known tool names.

### 3.4 Streaming (SSE) protocol

`POST /chat/stream` returns `Content-Type: text/event-stream`. Each event is one line `data: <json>` terminated by a blank line.

| Event payload | Meaning | Notes |
|---|---|---|
| `{"sources": [{digimon_id, name, score}, …]}` | Retrieved context | **Added by patch B1**, emitted once, first. Without B1 it never arrives. |
| `{"token": "text"}` | Next text fragment | Append in order. |
| `{"done": true, "conversation_id": "…", "latency_ms": 1234}` | Finished | Gains `"usage": {…}` after B1. **Store `conversation_id` here.** |
| `{"error": "Internal server error"}` | Failure *after* the stream started | Keep partial text, mark message errored. |

**Critical details:**
- The browser `EventSource` API only supports GET → you **must** use `fetch()` + `ReadableStream` and parse SSE manually (reference parser in Appendix B).
- Pre-stream failures (off-topic 400, validation 422, 500) arrive as a **normal non-200 JSON response** — check `res.ok` *before* reading the body as a stream.
- An empty-text response with an immediate `done` is possible (e.g. retrieval returned nothing and the model answered "the context doesn't say"). Never treat "zero tokens" as an error without checking.
- If the client aborts mid-stream, the server generator is cancelled and **the turn is (almost certainly) not saved to memory**. Mark stopped messages as "not remembered".

### 3.5 Error contract

| Status | Body | Source | UI behaviour |
|---|---|---|---|
| 400 | `{"detail": "I'm only able to answer questions about Digimon. …"}` | Off-topic guardrail | **Not an error.** Render as a friendly assistant-style notice + suggested prompts. Do not add to server-memory expectations. |
| 404 | `{"detail": "Digimon not found"}` | `/digimon/{id}` | "Not found" state in the drawer. |
| 422 | FastAPI validation list (`detail` is an *array*) | bad request | Should be prevented client-side; show generic "invalid request". |
| 429 | – | nginx `limit_req` (§9) / optional limiter | "Too many requests — retry in N s" (honour `Retry-After` if present). |
| 500 | `{"detail": "Internal server error"}` | any | Retry button. |
| 502/503/504 | – / `{"detail": "Database unavailable"}` | proxy/DB | "Service unavailable" + status banner. |
| network/abort | – | – | Distinguish **user abort** (silent, "Stopped") from **network failure** ("Can't reach server" + retry). |

`detail` may be a string **or** an array — always handle both.

### 3.6 Known quirks & limitations that shape the UX

1. **Silent degradation on embedding failure.** `Embedder.embed_text` catches *all* errors and returns `[]`, so `Retriever` returns `[]` and the model answers "the context doesn't contain the answer". With Voyage's free tier (3 RPM) a live demo will hit this after ~3 questions/minute. → UI: when `sources` is empty, show a subtle "No supporting sources were retrieved — this answer may be incomplete" note with a Retry button. Do **not** change the backend to throw (out of scope; risky).
2. **Cost/latency per question:** guardrail LLM call + (follow-ups) contextualize LLM call + 1 embedding + generation (+ 3-metric LLM judge in the background for `/chat`). Public deployments need rate limiting (§9).
3. **Memory expires after 1 hour.** After that the server silently starts fresh while the UI still shows the old messages. → UI hint on conversations older than 1 h: "Earlier context may no longer be remembered."
4. **Agent & Graph modes have no memory.** → label them clearly; warn once when switching mid-conversation.
5. **First-message cache:** identical first questions return instantly from Redis with a *new* `conversation_id` — fine, just use the returned id.
6. **CORS** is `allow_origins=["*"]` with credentials disabled (so never use cookies/credentialed fetch).
7. **Image URLs** (`image_url`) come from DAPI/third-party hosts and can be `null` or broken → always provide a fallback avatar and use `loading="lazy"` + `referrerPolicy="no-referrer"`.
8. `/digimon` currently has **no `ORDER BY`** — OFFSET pagination is unreliable. Patch B2 fixes this (`ORDER BY dapi_id`).
9. `/health` is shallow. A green dot means "API process is up", not "RAG works". Word the UI accordingly ("API online").

---

## 4. Backend change plan

### 4.1 Protocol (follow exactly)

```bash
# 0. Branch + environment (do NOT run ingest or the RAGAS eval for this)
git checkout -b feat/frontend
python -m venv venv && source venv/bin/activate && pip install -r requirements.txt

# 1. BASELINE — record the number. Expected on the current main: 21 passed.
ANTHROPIC_API_KEY=x VOYAGE_API_KEY=x pytest tests/ -q --ignore=tests/test_ingestion.py

# 2. Apply the validated patch (additive changes + their tests)
git apply --check backend-additive.patch && git apply backend-additive.patch

# 3. Re-run. Expected: 31 passed (21 original + 10 new). If anything original fails, STOP and revert.
ANTHROPIC_API_KEY=x VOYAGE_API_KEY=x pytest tests/ -q --ignore=tests/test_ingestion.py
git add -A && git commit -m "feat(api): additive endpoints/fields for the web frontend"
```

If `git apply --check` fails (the repo moved on), implement B1–B5 **by hand** from §4.2 and write the tests described there. Never use `git apply --3way`/force options to "make it fit".

After the commit, any *further* backend change must follow: **change → add/adjust a mocked test → full suite green → commit**.

### 4.2 Validated changes (all in `backend-additive.patch`)

Each was prototyped on a scratch copy and verified: all 21 original tests still pass, 10 new tests pass.

#### B1 — Stream: emit `sources`, include `usage`, proxy-friendly headers — `app/api/routes/chat.py`
Why: the stream currently has **no way to deliver citations** to the UI, and nginx/CDNs buffer SSE unless told not to.

```python
def _sources_from_chunks(context_chunks: list) -> list:
    """Shape retrieved chunks into the public `context_sources` format (same as /chat)."""
    return [
        {
            "digimon_id": c.get("payload", {}).get("digimon_id"),
            "name": c.get("payload", {}).get("name"),
            "score": c.get("score"),
        }
        for c in context_chunks
    ]

# inside generate(), as the FIRST yield inside the existing `try:`
yield f"data: {json.dumps({'sources': _sources_from_chunks(context_chunks)})}\n\n"

# done event gains "usage" (other keys unchanged)
yield f"data: {json.dumps({'done': True, 'conversation_id': conversation_id, 'latency_ms': latency_ms, 'usage': chunk['usage']})}\n\n"

# response gains headers
return StreamingResponse(
    generate(),
    media_type="text/event-stream",
    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
)
```
Compatibility: old clients (e.g. the README's `curl -N` demo) just see one extra `data:` line. The existing stream tests only assert that `"token"` and `"done"` appear — still true. **Leave `/chat` untouched.**
Tests added (`tests/test_chat_stream.py`): sources event is first and well-formed; `done` has `conversation_id` + `usage`; headers present.

#### B2 — `GET /digimon`: richer items, search, filters, total count, stable order — `app/api/routes/digimon.py`
- New **optional** query params: `q` (name `ILIKE`), `level`, `type` (Python name `type_`, `alias="type"`), `attribute`.
- Items gain `attribute` and `image_url` (existing keys unchanged → still a JSON **array**).
- Adds `X-Total-Count` response header (the count of rows matching the filters, before pagination).
- Adds `ORDER BY dapi_id` (bug fix: OFFSET paging without ORDER BY is non-deterministic).
- Browsers can only read `X-Total-Count` cross-origin if exposed — with the nginx same-origin proxy this is a non-issue. If you ever host the UI on another origin, add `expose_headers=["X-Total-Count"]` to the CORS middleware.

#### B3 — `GET /digimon/filters` — `app/api/routes/digimon.py`
Returns `{levels, types, attributes}` — sorted, de-duplicated, non-null values from `digimon_metadata`.
**Declared above `/digimon/{digimon_id}`** (see rule 2.1.6). 503 `Database unavailable` on `SQLAlchemyError`, like the sibling routes.
Tests (`tests/test_digimon_endpoints.py`) use an **in-memory SQLite** engine behind `patch("app.api.routes.digimon.PostgresManager")` — no Postgres needed. They cover: array shape back-compat, new fields + total header, deterministic pagination, `q`/`level`/`type` filtering, the route-order regression, and `GET /digimon/{id}` (200/404).

#### B4 — `POST /agent/graph`: expose the rewritten query — `app/api/routes/agent.py`
`GraphResponse` gains `rewritten_query: Optional[str] = None`, populated from `final_state.get("rewritten_query")`. Lets the UI show "Your question was refined to: …" — a nice showcase of Corrective RAG. Tests: `tests/test_graph_endpoint.py`.

#### B5 — Configurable CORS — `app/core/config.py`, `app/api/main.py`, `.env.example`
`cors_origins: str = "*"` (comma-separated). Default keeps today's behaviour exactly. Verified: with `CORS_ORIGINS=https://a.example,https://b.example` a preflight from `a.example` is allowed and from `evil.example` is rejected.
Also append to `.env.example`:
```
# Frontend / CORS — comma-separated list of allowed browser origins ("*" = any)
CORS_ORIGINS=*
```
(Not needed when the UI and API share an origin via the nginx proxy — the recommended deployment.)

### 4.3 Optional backend work (NOT in the patch — only if you need it)

Do these **after** the frontend works end-to-end, one at a time, each with mocked tests and the same additive rules.

| ID | Change | Notes |
|---|---|---|
| B6 | `GET /api/v1/health/ready` — checks Qdrant (`get_collections`), Redis (`ping`), Postgres (`SELECT 1`) with short timeouts, returns per-dependency booleans; 503 if Qdrant or Postgres is down. | **Do not alter `/health`** — the Dockerfile `HEALTHCHECK` and the UI use it. Never include hostnames/credentials in the response. The UI can use this for a richer status popover. |
| B7 | Rate limiting (Redis fixed-window per client IP) on `/chat`, `/chat/stream`, `/agent`, `/agent/graph`, **disabled by default** (`RATE_LIMIT_PER_MINUTE=0`). 429 + `Retry-After`. **Fail-open** if Redis errors (same philosophy as `InputGuard`). | Primary protection should be nginx `limit_req` (§9). Behind a proxy use `X-Forwarded-For` only when an explicit `TRUST_PROXY=true` is set, otherwise everyone shares the proxy IP. This closes the README's roadmap item "Rate limiting and authentication" only partially (no auth). |
| B8 | `GET /api/v1/conversations/{id}` → `{conversation_id, messages:[{role,content}]}` from `conv:{id}`, 404 if missing. | Skip unless you want cross-device restore. localStorage is the UI's source of truth. If added, treat the UUID as a bearer secret and never list conversations. |

Do **not** add: auth, user tables, Alembic migrations, new Qdrant collections, prompt changes.

---

## 5. Frontend architecture

### 5.1 Stack (use current stable releases; pin exact versions in the lockfile)

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite** + **React** + **TypeScript (strict)** | Fast, standard, static output for nginx. |
| Styling | **Tailwind CSS** + CSS variables for theme tokens | Consistent, small bundle, dark mode via `class`. |
| Components | **shadcn/ui** (Radix primitives) copied into `src/components/ui` | Accessible dialogs/popovers/tooltips/tabs/drawer without a heavy runtime dependency. |
| Routing | **React Router** (`createBrowserRouter`) | `/`, `/explore`, `/about`. |
| Server state | **TanStack Query** | Caching/retry for REST (`/digimon*`, `/health`). |
| Client state | **Zustand** (+ `persist`) | Conversations, settings. Tiny and testable. |
| Validation | **zod** | Parse every API response; contract drift becomes a visible error, not a blank screen. |
| Markdown | **react-markdown** + **remark-gfm** (no raw HTML, no `rehype-raw`) | Safe rendering of model text. Lazy-loaded. |
| Icons | **lucide-react** | Tree-shakeable. |
| Tests | **Vitest** + **Testing Library** + **MSW** (unit/integration); **Playwright** + **axe** (e2e/a11y) | No live backend needed. |
| Quality | ESLint (typescript-eslint, react-hooks, jsx-a11y) + Prettier | Enforced in CI. |

### 5.2 Directory layout

```
frontend/
├── index.html
├── package.json / package-lock.json
├── vite.config.ts            # dev proxy: /api → http://localhost:8000 ; manualChunks for markdown
├── tsconfig.json             # strict, noUncheckedIndexedAccess
├── tailwind.config.ts / postcss.config.js
├── .env.example              # VITE_API_BASE_URL=/api/v1
├── Dockerfile  .dockerignore
├── nginx/default.conf  nginx/security-headers.conf
├── e2e/                      # Playwright specs + mock server
└── src/
    ├── main.tsx  App.tsx  routes.tsx
    ├── config/env.ts         # zod-validated import.meta.env
    ├── api/
    │   ├── client.ts         # fetch wrapper: base URL, timeout, abort, error normalisation
    │   ├── schemas.ts        # zod schemas == §3.3 contract
    │   ├── sse.ts            # readSSE() async generator (Appendix B)
    │   ├── chat.ts           # streamChat(), chat(), agent(), graph()
    │   └── digimon.ts        # list(), get(), filters(), health()
    ├── store/
    │   ├── conversations.ts  # persisted conversations + messages
    │   └── settings.ts       # theme, mode, streaming on/off, filters
    ├── features/
    │   ├── chat/             # ChatPage, MessageList, Message, Composer, ModeSwitch, FilterBar,
    │   │                     # SourcesPanel, SuggestedPrompts, ConversationSidebar, useChatController
    │   ├── explorer/         # ExplorerPage, DigimonCard, DigimonDrawer, FilterControls, Pagination
    │   ├── about/            # AboutPage (architecture explainer)
    │   └── status/           # StatusIndicator, useHealth
    ├── components/ui/        # shadcn primitives
    ├── components/           # Layout, ThemeToggle, ErrorBoundary, Markdown (lazy), EmptyState, Skeletons
    ├── lib/                  # cn(), format.ts, dedupeSources.ts, id.ts
    └── test/                 # setup, msw handlers, fixtures
```

### 5.3 Environment & dev workflow

- `VITE_API_BASE_URL` default **`/api/v1`** (relative). In dev, Vite proxies `/api` → `http://localhost:8000` (no CORS needed, mirrors prod). In prod, nginx proxies `/api/` → the `api` service.
- Only override `VITE_API_BASE_URL` for a split-origin deployment (then set backend `CORS_ORIGINS`, §9.4).
- Scripts: `dev`, `build`, `preview`, `lint`, `typecheck`, `test`, `test:e2e`, `format`.

### 5.4 API layer rules (`src/api`)

1. One `request()` helper: base URL, JSON headers, `AbortSignal`, default timeout (30 s REST; 120 s for non-streaming agent/graph; streaming has no hard timeout but a **first-byte timeout of 60 s**).
2. Normalise every failure into `ApiError { kind: 'offtopic'|'validation'|'ratelimit'|'server'|'unavailable'|'network'|'aborted'|'parse'; status?; message; retryAfter? }`. Map per §3.5. `detail` may be string **or** array.
3. Parse every success body with zod; on failure → `ApiError{kind:'parse'}` and `console.error` the zod issue (dev only).
4. Normalise usage to `{ promptTokens, completionTokens, totalTokens }` (see §3.3 note).
5. Never log request bodies/answers in production builds.
6. Pure functions + dependency-injected `fetch` so MSW and unit tests are trivial.

### 5.5 State model

```ts
type ChatMode = 'rag' | 'agent' | 'graph';
type MessageStatus = 'pending' | 'streaming' | 'done' | 'error' | 'stopped' | 'blocked';

interface Message {
  id: string; role: 'user' | 'assistant';
  content: string; status: MessageStatus; mode: ChatMode; createdAt: number;
  sources?: { digimonId: number; name: string; score: number }[];   // deduped
  meta?: { latencyMs?: number; usage?: Usage; toolCalls?: Record<string, number>;
           iterations?: number; documentsUsed?: number; rewrittenQuery?: string | null; notRemembered?: boolean };
  error?: { kind: string; message: string };
}
interface Conversation {
  id: string;                     // local id
  serverConversationId?: string;  // from backend `conversation_id` (RAG mode only)
  title: string; createdAt: number; updatedAt: number; messages: Message[];
}
```
Persistence: `localStorage` via Zustand `persist` with a **schema `version` + `migrate`**, wrapped in try/catch (quota/private-mode), cap at 50 conversations × 200 messages (drop oldest). On load, any message left in `pending|streaming` is converted to `stopped` (page was closed mid-stream).

---

## 6. Feature specifications

### 6.1 Chat (`/`)

#### 6.1.1 Layout
Desktop: left **sidebar** (conversations, new chat, delete, theme/status footer) · center **thread** · optional right **sources panel** (collapsible; becomes a bottom sheet on mobile).
Mobile: sidebar is a drawer; composer is sticky at the bottom and respects the keyboard/safe-area (`env(safe-area-inset-bottom)`, `100dvh`).

#### 6.1.2 Modes (segmented control above the composer)

| Mode | Endpoint | Streaming | Memory | Filters | Extra UI |
|---|---|---|---|---|---|
| **Standard RAG** (default) | `POST /chat/stream` (fallback `POST /chat` if streaming is switched off in settings or the stream fails to start) | yes | yes (`conversation_id`) | yes | sources, latency, tokens |
| **Agent** | `POST /agent` | no | no | no | tool chips (`rag_search ×1`, `get_digimon_by_name ×1` …), tokens, latency |
| **Corrective RAG** | `POST /agent/graph` | no | no | no | "Refined N times" badge, `rewritten_query`, `documents_used`, latency |

- Disable (grey out + tooltip "Not available in this mode") the filter controls when mode ≠ RAG.
- When the user switches *into* Agent/Graph in a non-empty conversation, show a one-time inline notice: "This mode doesn't remember earlier messages."
- Every assistant message shows a small mode badge.
- Agent/Graph requests can take many seconds: show an elapsed-time counter ("Working… 7 s") and a Stop button. Do **not** fake tool names or progress steps the backend doesn't send.

#### 6.1.3 Sending a message (state machine)

```
idle ──send──▶ pending ──first token / response──▶ streaming ──done──▶ done
                 │  │                                   │
                 │  └── 400 off-topic ──▶ blocked       ├── user Stop ──▶ stopped (notRemembered)
                 └── network/5xx/429 ──▶ error          └── {error} event / network drop ──▶ error (keep partial text)
```
- Pre-first-token latency is typically 1–4 s (guardrail + embedding + retrieval). Show a typing indicator immediately and, after ~6 s, a hint ("Still searching the knowledge base…").
- On `done` (RAG): store `serverConversationId` from the event. First message of a conversation sends **no** `conversation_id`; all later RAG messages send it.
- **Retry** (only for `error`/`stopped`): resend the same query + same `serverConversationId`. This is safe because the backend persists a turn only on success. There is intentionally **no "Regenerate" on successful answers** (it would duplicate the turn in server memory).
- **Blocked (400)**: render `detail` as a muted assistant bubble with 3 suggested prompts; the user's message stays in the thread; mark `notRemembered`.
- Disable Send while a request is in flight; Enter = send, Shift+Enter = newline, Esc = stop, `/` focuses the composer, Ctrl/Cmd+K = new chat.
- Client-side limits: trim whitespace, block empty, **max 2000 chars** with a live counter at 90 %.
- Token batching: buffer incoming tokens and flush via `requestAnimationFrame` (≈ 60 fps max) so a fast stream doesn't re-render the whole list per token. Memoize `Message` and keep the streaming message's state isolated.

#### 6.1.4 Filters (RAG mode only)
Two selects (Level, Type) populated from `GET /digimon/filters` (cached 1 h, `staleTime`), with an "Any" option and a clear-all chip. Persist in settings. If the filters call fails → static level fallback list + hide Type. Sent as `level_filter` / `type_filter` only when set.
Show an active-filter chip row so users never forget a filter is narrowing results (a common cause of "no info" answers).

#### 6.1.5 Sources
- Dedupe by `digimon_id` (max score). Show as chips under the answer: name + relevance bar (score 0.5–1.0 → 0–100 %).
- Clicking a chip opens the **Digimon drawer** (same component as Explorer) via `?id=` search param.
- Empty sources in RAG mode → the "no supporting sources" note (§3.6.1) with Retry.
- Sources for the `/chat` fallback come from `context_sources`; for streaming from the `sources` event (patch B1). If B1 is absent, hide the sources UI rather than showing an empty one.

#### 6.1.6 Rendering model output
`react-markdown` + `remark-gfm`; **no raw HTML**; links open with `rel="noopener noreferrer" target="_blank"`; code blocks with a copy button; tables scroll horizontally. Lazy-load the renderer (`React.lazy`) and show plain text until it loads. While streaming, render markdown incrementally but avoid layout jumps (reserve min-height, no animated height). Copy button copies the raw text.

#### 6.1.7 Conversations sidebar
List sorted by `updatedAt`; title = first user message (40 chars). Rename (inline), delete (with undo toast), "Clear all" (confirm dialog). Export current conversation as Markdown (client-side download). Show "Earlier context may no longer be remembered" when `Date.now() - updatedAt > 60 min` in RAG mode.

#### 6.1.8 Empty state
Brand header, one-sentence description, 4 suggested prompts that exist in the sample data domain (e.g. "Tell me about Agumon", "What are Agumon's digivolutions?", "Which Rookie Digimon are Reptile type?", "Compare Greymon and Garurumon"), and a "Browse the Digimon" link to `/explore`. Suggested prompts fill + send on click.

### 6.2 Explorer (`/explore`)

- Server-side pagination (page size 24; `limit/offset`), `X-Total-Count` for page count, search box (debounced 300 ms → `q`), filter selects (level/type/attribute from `/digimon/filters`), URL-synced state (`?q=&level=&type=&attribute=&page=&id=`), shareable deep links.
- **Card:** image (aspect-square, lazy, fallback avatar with initial), name, level badge, type.
- **Drawer/dialog** (`GET /digimon/{id}`): large image, name, badges (level/type/attribute), description (plain text), "Ask about this Digimon" → navigate to `/` with a new conversation and send `Tell me about {name}`. 404 → "Digimon not found" state; 503 → retry.
- States: skeleton grid while loading; empty ("No Digimon match your filters" + clear filters); error with retry; "Only N Digimon have been ingested (INGEST_LIMIT)" note when total is small (< 150) — this explains why some names are missing.
- Prefetch the next page on idle; keep previous page data while fetching (`placeholderData`).

### 6.3 How it works (`/about`)
Static page, no API: the request flow diagram from §3.1 (inline SVG, theme-aware), a short description of each mode and why they differ, the RAGAS baseline numbers **quoted from the README** (faithfulness 1.000, answer relevancy 0.848, context precision 0.883, context recall 1.000 on the default 100-Digimon ingest — label them "from the repository README; measured by the author"), tech stack, link to the GitHub repo, data attribution to **DAPI (digi-api.com)**, and a footer disclaimer: *"Unofficial fan project. Digimon is a trademark of its respective owners. Not affiliated with Bandai/Toei."* Do not add logos or copyrighted artwork.

### 6.4 System status
`GET /health` polled every 30 s (paused when the tab is hidden; backoff to 2 min when failing). Header pill: green "API online" / amber "Checking…" / red "API offline". When offline: persistent banner + disable Send with an explanatory tooltip; auto-recover and toast "Back online". (Remember: green = process is up, not "RAG works".)

### 6.5 Settings (popover, persisted)
Theme (system/light/dark), "Stream responses" toggle (default on), "Show token usage & latency" toggle (default on), "Reduce motion" (follows OS, overridable).

---

## 7. UX, accessibility, performance, security requirements

### 7.1 Visual design
Clean, neutral, high-contrast; one accent color (e.g. Digimon-orange or digital blue) used sparingly; generous spacing; system font stack or one self-hosted variable font (no third-party font CDN → keeps CSP strict and avoids layout shift). Design tokens as CSS variables (`--background`, `--foreground`, `--muted`, `--accent`, `--border`, `--ring`, `--destructive`), light + dark. Respect `prefers-color-scheme` on first visit, then the user's choice. Avoid layout shift (CLS < 0.05): reserve image/avatar sizes.

### 7.2 Accessibility (WCAG 2.1 AA — must pass axe with zero serious/critical issues)
- Semantic landmarks (`header`, `nav`, `main`, `aside`), one `h1` per route, visible focus rings, logical tab order, skip-to-content link.
- Message list: `role="log"` + `aria-live="polite"`, **but** announce the finished answer once (a visually-hidden status node updated on `done`), not every token.
- Status changes (offline/online, errors, copied) use `role="status"`/`role="alert"` appropriately.
- All icon buttons have accessible names; tooltips are not the only label.
- Color is never the only signal (status pill has text; relevance bars have numbers).
- Contrast ≥ 4.5:1 text / 3:1 UI in **both** themes; honour `prefers-reduced-motion` (disable typing/shimmer animations).
- Fully keyboard operable (drawer/dialog focus trap + restore, Esc closes). Touch targets ≥ 44×44 px.

### 7.3 Performance budgets
- Initial JS ≤ **200 kB gzip** (route-level code splitting; markdown renderer, Explorer and About lazy-loaded).
- LCP < 2.5 s, INP < 200 ms on a mid-range mobile profile with throttled network.
- Virtualize the message list only if > 200 rendered messages (otherwise it harms a11y/find-in-page).
- Images: `loading="lazy"`, `decoding="async"`, explicit width/height.
- Hashed assets cached `immutable`; `index.html` `no-cache` (§9.2).

### 7.4 Security
- No `dangerouslySetInnerHTML`; markdown without raw HTML; sanitize/validate all server data with zod; treat model output and DAPI descriptions as **untrusted text**.
- CSP (nginx): `default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`. (`img-src https:` is needed because `image_url` points to third-party hosts. If you later proxy/cached images, tighten it.)
- External links: `rel="noopener noreferrer"`. External images: `referrerPolicy="no-referrer"`.
- No API keys, no `.env` secrets, no analytics/trackers by default. LocalStorage holds only chat text + settings — say so in the About/footer ("Conversations are stored in your browser").
- Dependency hygiene: `npm audit --omit=dev` in CI (fail on high/critical).

---

## 8. Testing strategy

| Layer | Tooling | Must cover |
|---|---|---|
| **SSE parser** (unit) | Vitest | Events split across arbitrary chunk boundaries (including mid-JSON and mid-`\n\n`), multiple events in one chunk, `\r\n`, unicode (`\u…` escapes), malformed JSON ignored, unknown keys ignored, trailing buffer, abort mid-read. |
| **API client** (unit/MSW) | Vitest + MSW | Each status in §3.5 → correct `ApiError.kind`; `detail` string vs array; zod parse failure; timeout; abort vs network error. |
| **Stores** (unit) | Vitest | Persist/migrate, caps, `pending→stopped` on rehydrate, quota error tolerance. |
| **Chat controller** (integration) | Testing Library + MSW | Happy-path stream (sources → tokens → done) updates UI & stores `serverConversationId`; second message sends it; off-topic 400 → blocked bubble; mid-stream `{error}` keeps partial text; Stop → `stopped`/`notRemembered`; Retry; mode switching; empty sources note; filter params only in RAG mode. |
| **Explorer** (integration) | Testing Library + MSW | URL-synced filters/pagination, debounced search, drawer open/404/503, "Ask about" hand-off. |
| **A11y** | `@axe-core/playwright` | Zero serious/critical violations on `/`, `/explore` (with drawer open), `/about` in light + dark. |
| **E2E smoke** | Playwright + a tiny mock server (`e2e/mock-server.ts`) that emits real SSE | Send → stream renders; follow-up; off-topic; stop; offline banner (kill mock); explorer search → drawer → ask. **No real backend, no API keys.** |
| **Visual/responsive** | Playwright screenshots at 375, 768, 1280 px (light/dark) | No horizontal scroll, composer reachable, sidebar drawer works. |

Coverage target: ≥ 80 % lines on `src/api`, `src/store`, `src/features/chat/useChatController`.
Frontend tests must never hit the network or the real backend.

---

## 9. Build, containerize, deploy

### 9.1 Recommended topology (simplest that is production-sane)
One host (VPS/VM) running Docker Compose: **`web`** (nginx: static SPA + `/api/` reverse proxy) → **`api`** (FastAPI) → `qdrant`, `redis`, `postgres` (+ optional `langfuse`). Same origin for UI and API ⇒ **no CORS, no mixed content, SSE just works**. Put HTTPS in front (Caddy/Traefik/Cloudflare Tunnel/host nginx + Let's Encrypt).

Why not a pure static host (Vercel/Netlify/Pages) for the UI? You can (§9.5), but the backend needs Qdrant + Redis + Postgres anyway, and some CDNs/rewrites buffer SSE and kill streaming. Same-origin compose avoids the whole class of problems.

### 9.2 `frontend/nginx/default.conf`
```nginx
# http-context directive — valid at top level of a conf.d file
limit_req_zone $binary_remote_addr zone=llm_per_ip:10m rate=20r/m;
limit_req_status 429;

server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  include /etc/nginx/snippets/security-headers.conf;

  location = /healthz { access_log off; return 200 "ok\n"; add_header Content-Type text/plain; }

  # LLM-backed endpoints: rate-limited, never buffered (SSE)
  location ~ ^/api/v1/(chat|agent) {
    limit_req zone=llm_per_ip burst=10 nodelay;
    proxy_pass http://api:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_buffering off;          # critical for SSE
    proxy_cache off;
    gzip off;                     # never compress event-stream
    proxy_read_timeout 300s;      # agent/graph can be slow
    include /etc/nginx/snippets/security-headers.conf;
  }

  location /api/ {
    proxy_pass http://api:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_read_timeout 60s;
    include /etc/nginx/snippets/security-headers.conf;
  }

  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    include /etc/nginx/snippets/security-headers.conf;
  }

  location / {
    try_files $uri /index.html;
    add_header Cache-Control "no-cache";
    include /etc/nginx/snippets/security-headers.conf;
  }
}
```
`frontend/nginx/security-headers.conf` (copied to `/etc/nginx/snippets/` in the image):
```nginx
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "DENY" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;
add_header Content-Security-Policy "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" always;
```
**nginx gotcha:** any `add_header` inside a `location` *replaces* the inherited server-level ones — that is why the snippet is `include`d in every location. Do not "simplify" this.
If nginx sits behind another proxy/CDN, `$binary_remote_addr` is that proxy's IP — configure `real_ip_header`/`set_real_ip_from` or the limit applies to everyone at once.

### 9.3 `frontend/Dockerfile`
```dockerfile
# ---- build ----
# Use the current Node LTS major (verify at implementation time).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- serve ----
# Use a current stable nginx tag (verify at implementation time).
FROM nginx:1.27-alpine
COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://localhost/healthz || exit 1
```
`frontend/.dockerignore`: `node_modules`, `dist`, `e2e`, `coverage`, `.env*`.

### 9.4 `docker/docker-compose.app.yml` (new overlay — do not edit the existing compose file)
```yaml
services:
  api:
    build:
      context: ..
      dockerfile: Dockerfile
    env_file: ../.env
    environment:            # service names replace the localhost defaults from .env
      QDRANT_HOST: qdrant
      REDIS_HOST: redis
      POSTGRES_HOST: postgres
      LANGFUSE_HOST: http://langfuse:3000
      CORS_ORIGINS: ${CORS_ORIGINS:-*}
    depends_on:
      postgres:
        condition: service_healthy
      qdrant:
        condition: service_started
      redis:
        condition: service_started
    expose:
      - "8000"
    restart: unless-stopped

  web:
    build:
      context: ../frontend
    ports:
      - "8080:80"
    depends_on:
      - api
    restart: unless-stopped
```
Run (from `docker/`):
```bash
docker compose --env-file ../.env -f docker-compose.yml -f docker-compose.app.yml up -d --build
# one-off ingestion inside the api image (slow on the Voyage free tier; run in the background)
docker compose -f docker-compose.yml -f docker-compose.app.yml run --rm api python -m app.ingestion.ingest
```
`--env-file ../.env` matters: Compose otherwise reads `docker/.env`, so `${POSTGRES_PASSWORD}` would silently fall back to the default.

### 9.5 Alternative: UI on a static host, API elsewhere (only if you must)
- Build with `VITE_API_BASE_URL=https://api.example.com/api/v1`; set backend `CORS_ORIGINS=https://your-ui.example` (B5).
- Add `expose_headers=["X-Total-Count"]` to the CORS middleware (otherwise the Explorer can't read the total).
- Call the API origin **directly** from the browser. Do **not** route `/chat/stream` through a platform rewrite/edge function — many buffer or time out SSE.
- Backend must be HTTPS (mixed content is blocked).

### 9.6 Production hardening checklist
- [ ] HTTPS everywhere; HSTS at the TLS terminator.
- [ ] The **base compose publishes** `6333` (Qdrant), `6379` (Redis), `5432` (Postgres), `3000` (Langfuse) on the host. On a public machine, firewall them (or bind to `127.0.0.1`; recent Compose versions support `ports: !override [...]` in an overlay — verify your version). Only `8080`/443 should be public.
- [ ] Change `POSTGRES_PASSWORD`, `LANGFUSE_NEXTAUTH_SECRET`, `LANGFUSE_SALT` from the example defaults.
- [ ] Set **spend limits** on the Anthropic and Voyage accounts. A public chat box is a billing endpoint. Keep nginx `limit_req` on.
- [ ] Voyage free tier = 3 RPM: add a payment method for any public demo, or users will see the "no sources" degradation (§3.6.1) constantly.
- [ ] Ingestion done (`INGEST_LIMIT` understood); Explorer shows the real total.
- [ ] `docker compose logs api` shows no stack traces during the QA script.

### 9.7 CI — new file `.github/workflows/frontend.yml` (leave `ci.yml` alone)
```yaml
name: Frontend CI
on:
  push:
    branches: [main]
    paths: ["frontend/**", ".github/workflows/frontend.yml"]
  pull_request:
    paths: ["frontend/**", ".github/workflows/frontend.yml"]

jobs:
  frontend:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: frontend } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: lts/*, cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run test -- --run
      - run: npm run build
      - run: npm audit --omit=dev --audit-level=high
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
```
(Pin action versions to whatever is current when you implement this.)

---

## 10. Phased execution plan (with gates)

| Phase | Do | Gate (must pass before continuing) |
|---|---|---|
| **0. Baseline & scaffold** | §4.1 baseline → apply patch → commit. Scaffold `frontend/` (Vite+React+TS strict, Tailwind, shadcn init, ESLint/Prettier, Vitest, MSW, Playwright). Dev proxy to `:8000`. Write `docs/FRONTEND_NOTES.md`. | Backend: **31 passed**. Frontend: `lint`, `typecheck`, `test`, `build` all green on the empty shell. |
| **1. API layer** | `schemas.ts`, `client.ts`, `sse.ts`, `chat.ts`, `digimon.ts` + unit tests (§8). | All API/SSE unit tests green; fragmented-chunk SSE tests included; coverage ≥ 80 % in `src/api`. |
| **2. Chat MVP** | Layout shell, RAG-mode streaming, composer, message list, markdown, sources chips, Zustand persistence, empty state. | Integration tests green; with the real backend: a question streams, sources appear, a follow-up ("What are its digivolutions?") sends `conversation_id` and resolves the pronoun. |
| **3. Chat complete** | Agent + Graph modes, filters, Stop/Retry/Blocked, sidebar (rename/delete/export), settings, status pill/banner, keyboard shortcuts. | Controller integration tests cover every transition in §6.1.3; QA scenarios 1–10 (§11) pass manually. |
| **4. Explorer & About** | Grid, search, filters, pagination, URL sync, drawer, hand-off to chat; About page. | Explorer integration tests green; deep link `/explore?id=1` opens the drawer on load. |
| **5. Polish** | Theme tokens, responsive pass, a11y pass (axe), perf budgets, error boundary, 404 route, meta tags/favicon, loading skeletons. | axe: 0 serious/critical; Lighthouse targets (§1.3); bundle ≤ 200 kB gz initial. |
| **6. Ship** | Dockerfile, nginx, compose overlay, CI workflow, e2e suite, README section, final full QA through nginx. | `up --build` serves UI on :8080 and streaming works through the proxy; CI green; §1.3 checklist fully ticked. |

Commit at the end of every phase with a conventional message. Never leave `main` red.

---

## 11. Manual QA script (real backend, ingested data, through nginx on :8080)

1. **Cold start:** open `/` → empty state, suggested prompts, status pill "API online".
2. **Streaming:** "Tell me about Agumon" → text streams token-by-token, sources chips appear, latency/tokens shown.
3. **Follow-up memory:** "What are its digivolutions?" → answer is about Agumon; request body contains `conversation_id`.
4. **Narrow question:** "What level is Agumon?" → short answer (the prompt enforces scope discipline — confirm the UI doesn't mask this).
5. **Off-topic:** "What's the capital of France?" → friendly *blocked* bubble (not a red error), suggestions shown, thread still usable.
6. **Filters:** Level = Rookie, "List some Digimon" → sources are Rookie; chip row shows the active filter; mode ≠ RAG disables filters.
7. **Stop:** send a long question, press Esc mid-stream → "Stopped" + "not remembered", Retry works, no console errors.
8. **Agent mode:** "What are the skills of Agumon?" → tool chips; elapsed timer while waiting.
9. **Corrective RAG:** a vague question → iterations/`rewritten_query` shown when > 0.
10. **Backend down:** `docker compose stop api` → banner within ~30 s, Send disabled; `start api` → auto-recovers + toast.
11. **Rate limit:** hammer Send (≥ 30 requests/min) → 429 message with retry hint, UI recovers.
12. **Memory expiry hint:** set a conversation's `updatedAt` > 1 h in localStorage → hint appears.
13. **Persistence:** reload mid-stream → message becomes "Stopped"; reload normally → history intact; delete + undo works.
14. **Explorer:** search "agu", filter by level, paginate, open drawer, "Ask about this Digimon" lands in chat and sends.
15. **Deep link:** `/explore?id=1` and a hard refresh on `/about` (SPA fallback) both work.
16. **Mobile (375 px):** no horizontal scroll, composer above the keyboard, sidebar drawer + sources bottom sheet usable.
17. **Keyboard only & screen reader sanity:** full flow without a mouse; answer announced once on completion.
18. **Dark mode + reduced motion:** both themes readable; animations off under `prefers-reduced-motion`.
19. **Security:** DevTools → Network shows no keys; Console shows no CSP violations; page source has no secrets.
20. **Backend regression:** `pytest tests/ -q --ignore=tests/test_ingestion.py` still green; `curl -N` the README's streaming example still works (now with one extra `sources` line).

---

## 12. Pitfalls checklist (read before you start; re-read before you finish)

- ❌ `EventSource` for `/chat/stream` (GET-only). ✅ `fetch` + stream reader.
- ❌ Treating the off-topic **400** as an error. ✅ It is a normal product state.
- ❌ Assuming the 400 arrives as an SSE event. ✅ It is a plain JSON response *before* the stream.
- ❌ Reading `res.body` without checking `res.ok`.
- ❌ Parsing SSE by splitting each network chunk on `\n` — chunks split anywhere. ✅ Buffer until a blank line.
- ❌ Re-rendering the whole message list per token. ✅ rAF-batch + memoized messages.
- ❌ Sending `conversation_id` to `/agent/graph`, or filters to `/agent*` — silently ignored; confusing.
- ❌ "Regenerate" on a successful answer (duplicates the turn in Redis memory).
- ❌ Hard-coding level/type filter values — exact-match against stored payloads. ✅ `/digimon/filters`.
- ❌ Declaring `/digimon/filters` below `/digimon/{digimon_id}`.
- ❌ Editing `SYSTEM_PROMPT`, retriever thresholds, ingestion, eval scripts, or Qdrant payload keys.
- ❌ Changing `tests/conftest.py` fixture scope, or patching at the *source* module instead of the import site.
- ❌ `localStorage`/zustand persist without try/catch + schema versioning.
- ❌ nginx `add_header` in a `location` without re-including the security snippet; buffering/gzip left on for SSE.
- ❌ Trusting that "API online" means "RAG works" (shallow `/health`; embedding errors are swallowed).
- ❌ Showing the 3-metric LLM-judge scores — they go to Langfuse only, never to the client.
- ❌ Running `make ingest` / `evaluate_rag.py` synchronously during development.
- ❌ Committing `.env`, `node_modules`, `dist`, or Playwright artifacts.

---

## Appendix A — zod schemas (`src/api/schemas.ts`)

```ts
import { z } from "zod";

const num = z.number();
export const ContextSourceSchema = z.object({
  digimon_id: num.nullable(), name: z.string().nullable(), score: num.nullable(),
});
export const ChatResponseSchema = z.object({
  response: z.string(), conversation_id: z.string(),
  context_sources: z.array(ContextSourceSchema),
  token_usage: z.object({ prompt_tokens: num, completion_tokens: num, total_tokens: num }).partial().default({}),
  latency_ms: num,
});
export const AgentResponseSchema = z.object({
  response: z.string(), tool_calls: z.array(z.string()),
  usage: z.object({ input_tokens: num, output_tokens: num, total_tokens: num }),
  latency_ms: num,
});
export const GraphResponseSchema = z.object({
  response: z.string(), iterations: num, documents_used: num, latency_ms: num,
  rewritten_query: z.string().nullable().optional(),        // present after patch B4
});
export const DigimonListItemSchema = z.object({
  id: num, name: z.string(), level: z.string().nullable(), type: z.string().nullable(),
  attribute: z.string().nullable().optional(),               // after B2
  image_url: z.string().nullable().optional(),               // after B2
});
export const DigimonDetailSchema = z.object({
  id: num, name: z.string(), level: z.string().nullable(), type: z.string().nullable(),
  attribute: z.string().nullable(), description: z.string().nullable(), image_url: z.string().nullable(),
});
export const FiltersSchema = z.object({ levels: z.array(z.string()), types: z.array(z.string()), attributes: z.array(z.string()) });
export const HealthSchema = z.object({ status: z.string(), message: z.string() });

// SSE events — unknown keys are stripped, so new backend fields never break the UI
export const StreamEventSchema = z.union([
  z.object({ sources: z.array(ContextSourceSchema) }),
  z.object({ token: z.string() }),
  z.object({ done: z.literal(true), conversation_id: z.string(), latency_ms: num,
             usage: z.object({ prompt_tokens: num, completion_tokens: num, total_tokens: num }).optional() }),
  z.object({ error: z.string() }),
]);
export type StreamEvent = z.infer<typeof StreamEventSchema>;
```

## Appendix B — SSE reader (`src/api/sse.ts`)

```ts
/** Yields each parsed JSON `data:` payload. Handles arbitrary chunk boundaries. */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown, void, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  const parseBlock = (block: string): unknown | undefined => {
    const data = block
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""))
      .join("\n");
    if (!data) return undefined;
    try { return JSON.parse(data); } catch { return undefined; }   // ignore malformed event
  };

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let idx: number;
      while ((idx = buffer.indexOf("\n\n")) !== -1) {
        const evt = parseBlock(buffer.slice(0, idx));
        buffer = buffer.slice(idx + 2);
        if (evt !== undefined) yield evt;
      }
    }
    buffer += decoder.decode();
    const tail = parseBlock(buffer.trim());
    if (tail !== undefined) yield tail;
  } finally {
    reader.cancel().catch(() => {});   // also runs on abort / consumer break
  }
}
```
Consumer sketch:
```ts
const res = await request("/chat/stream", { method: "POST", body: JSON.stringify(req), signal });
if (!res.ok) throw await toApiError(res);          // 400/422/429/5xx arrive here, as JSON
if (!res.body) throw new ApiError("parse", "Empty response body");
for await (const raw of readSSE(res.body)) {
  const parsed = StreamEventSchema.safeParse(raw);
  if (!parsed.success) continue;                   // forward compatible
  const e = parsed.data;
  if ("sources" in e) onSources(dedupe(e.sources));
  else if ("token" in e) onToken(e.token);
  else if ("done" in e) onDone(e);
  else if ("error" in e) throw new ApiError("server", e.error);
}
```
(A lone `\r` split from its `\n` across two chunks is theoretically possible; the backend only emits `\n\n`, so this is acceptable. Note it in `FRONTEND_NOTES.md`.)

## Appendix C — README section to append

```markdown
## Web UI

A React + TypeScript frontend lives in [`frontend/`](frontend/): streaming chat (RAG / Agent / Corrective RAG modes),
source citations, and a Digimon explorer.

**Develop**
    make services && make ingest && make run        # backend on :8000
    cd frontend && npm ci && npm run dev            # UI on :5173 (proxies /api to :8000)

**Deploy (Docker)**
    cd docker
    docker compose --env-file ../.env -f docker-compose.yml -f docker-compose.app.yml up -d --build
    # UI → http://localhost:8080

See [`FRONTEND_BUILD_GUIDE.md`](FRONTEND_BUILD_GUIDE.md) for architecture and conventions.
```

## Appendix D — `docs/FRONTEND_NOTES.md` template (agent must create and maintain)

```markdown
# Frontend notes
## Decisions & deviations from FRONTEND_BUILD_GUIDE.md
- (date) <what> — <why> — <impact>
## Dependencies added (justification)
## Backend changes applied (B1–B5 + any optional) with commit hashes
## Known limitations
## Verified versions (Node, npm, key libs)
```

---

*End of guide. When in doubt: change less, test more, and keep every existing backend behaviour byte-for-byte compatible.*
