# Contributing to Railwise

Thank you for your interest in contributing to this project!

## Development Setup

1. Clone the repository
2. Create a virtual environment: `python3 -m venv venv`
3. Activate the virtual environment: `source venv/bin/activate`
4. Install dependencies: `pip install -r requirements.txt`
5. Copy `.env.example` to `.env` and add your Groq and Voyage AI API keys
6. Start Docker services from `docker/`: `docker compose --env-file ..\.env -f docker-compose.yml -f docker-compose.app.yml up -d`
7. Run data ingestion: `python -m app.ingestion.ingest` (or `make ingest`)
8. Start the server: `python -m app.api.main` (or `make run`)

## Code Style

- Follow PEP 8 guidelines
- Use type hints where appropriate
- Add docstrings to functions and classes
- Keep functions focused and small

## Testing

Run the backend tests with `python -m pytest -q`. The frontend checks are documented in the project [README](README.md#tests).

## Submitting Changes

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests
5. Submit a pull request

## Project Structure

```
app/
├── api/           # FastAPI routes
├── core/          # Configuration and logging
├── ingestion/     # Curated rail guidance ingestion
├── rag/           # RAG pipeline (retriever, prompt builder, LLM client)
├── guardrails/    # Input topic classifier (fail-open)
├── mcp/           # MCP server
├── agents/        # PydanticAI agent + LangGraph Corrective RAG (agents/graph/)
├── observability/ # Langfuse tracing + LLM-as-judge
└── db/            # Qdrant, PostgreSQL, Redis managers

docker/            # docker-compose.yml for local infrastructure
scripts/           # RAG evaluation (RAGAS) and demo recording
tests/             # pytest suite (mocked, no external services required)
```

## Questions?

Feel free to open an issue for any questions or suggestions.
