# Railwise — Indian Rail Travel Guidance

Railwise is a retrieval-augmented assistant for general Indian rail travel guidance. It answers from a small, source-linked corpus based on official IRCTC guidance, with a searchable archive and citations.

**It does not provide live train schedules, seat availability, PNR status, ticket booking, or individual refund decisions.** IRCTC pages may change; verify current details on the official site before acting.

## What this project demonstrates

- A custom RAG pipeline using Voyage AI embeddings and Qdrant retrieval.
- PostgreSQL-backed source records and archive search/filter/pagination.
- FastAPI chat with SSE streaming, conversation context in Redis, and optional response evaluation via Langfuse.
- PydanticAI tool-calling and LangGraph Corrective RAG modes.
- A React + TypeScript web app with source-linked rail guidance, responsive layout, and accessible interactions.

Read the [project overview](docs/PROJECT_OVERVIEW.md) for the architecture, question-answering flow, and system boundaries. The rail domain is an example corpus; the RAG architecture remains the core of the project.

## Stack

| Layer | Technology |
|---|---|
| API | FastAPI |
| LLM | Groq (`openai/gpt-oss-120b` by default; OpenAI-compatible API) |
| Embeddings | Voyage AI `voyage-3` (1024 dimensions) |
| Vector search | Qdrant |
| Source archive | PostgreSQL + SQLAlchemy |
| Conversation memory and response cache | Redis |
| Observability | Optional Langfuse tracing |
| Agent workflows | PydanticAI, MCP tools, LangGraph |
| Web UI | React, TypeScript, Vite |
| Local deployment | Docker Compose and nginx |

## Run with Docker on Windows

### First-time setup

1. Install and start Docker Desktop.
2. From PowerShell, create a local environment file:

   ```powershell
   cd D:\GenAI-Project\knowledge-rag-assistant-main\knowledge-rag-assistant-main
   Copy-Item .env.example .env
   notepad .env
   ```

3. Add your `GROQ_API_KEY` and `VOYAGE_API_KEY` to `.env`. Langfuse is optional. Keep this file private and do not commit it. The default Groq model is `openai/gpt-oss-120b`; set `GROQ_MODEL` to override it.
4. Build and start the services:

   ```powershell
   cd docker
   docker compose --env-file ..\.env -f docker-compose.yml -f docker-compose.app.yml up -d --build
   ```

5. Index the included source-linked guidance corpus (first time, or whenever you update it):

   ```powershell
   docker compose --env-file ..\.env -f docker-compose.yml -f docker-compose.app.yml run --rm api python -m app.ingestion.ingest
   ```

Open the web app at **http://localhost:8080**. Check API health at **http://localhost:8080/api/v1/health**.

### Start it next time

Start Docker Desktop, then from the `docker` folder run:

```powershell
docker compose --env-file ..\.env -f docker-compose.yml -f docker-compose.app.yml up -d
```

Stop the services with:

```powershell
docker compose --env-file ..\.env -f docker-compose.yml -f docker-compose.app.yml down
```

This keeps the Docker data volumes. Add `-v` only if you intentionally want to delete the stored database and vector data.

## Local development

Start the backend services using Docker from the `docker` folder:

```powershell
docker compose --env-file ..\.env up -d
```

From the project root, install Python dependencies, then run the API:

```powershell
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m app.api.main
```

In another terminal:

```powershell
cd frontend
npm ci
npm run dev
```

The local UI is at **http://localhost:5173** and proxies API requests to port `8000`. Run the corpus ingestion once after the services start:

```powershell
python -m app.ingestion.ingest
```

## Source corpus and limitations

The seed corpus is in [`app/ingestion/rail_guidance.json`](app/ingestion/rail_guidance.json). It summarizes official IRCTC pages about e-ticket cancellation, Tatkal booking, and e-ticket basics; each entry includes a source URL and a date it was last checked. Ingestion embeds these summaries and stores them in Qdrant and PostgreSQL. It does not automatically crawl or refresh IRCTC.

- [IRCTC e-ticket cancellation guide](https://contents.irctc.co.in/en/eticketCancel.html)
- [IRCTC Tatkal booking guide](https://contents.irctc.co.in/en/TatkalBooking.html)
- [IRCTC e-ticket guide](https://contents.irctc.co.in/en/bookEticket.html)

Some official pages do not show an effective or updated date. The app therefore avoids exact refund calculations and tells users to verify changing details directly with IRCTC. It is not affiliated with Indian Railways or IRCTC.

## API

- `POST /api/v1/chat` — RAG answer with optional `category_filter` and `topic_filter`.
- `POST /api/v1/chat/stream` — SSE streaming version of chat.
- `POST /api/v1/agent` — tool-calling assistant.
- `POST /api/v1/agent/graph` — Corrective RAG workflow.
- `GET /api/v1/rail/guidance` — searchable, filterable source archive.
- `GET /api/v1/rail/guidance/filters` — available categories and topics.
- `GET /api/v1/rail/guidance/{id}` — full source record.
- `GET /api/v1/health` — API health check.

## Tests

Backend tests are mocked and do not need API keys or external services:

```powershell
docker run --rm -v "D:\GenAI-Project\knowledge-rag-assistant-main\knowledge-rag-assistant-main:/app" -w /app docker-api:latest python -m pytest -q
```

Frontend checks:

```powershell
cd frontend
npm ci
npm run lint
npm run test
npm run test:e2e
npm run build
```

## License

MIT — see [LICENSE](LICENSE).
