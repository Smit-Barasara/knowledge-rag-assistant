# CLAUDE.md

Operational context for working in this repo — things that aren't obvious from reading the code once. See `README.md` for setup/features/architecture and `CONTRIBUTING.md` for the contribution workflow.

## Testing conventions

- Patch dependencies at the **import site**, not the source module — e.g. `patch("app.api.routes.chat.Retriever")`, not `patch("app.rag.retriever.Retriever")`. `chat.py` does `from app.rag.retriever import Retriever`, so the name lives in `chat.py`'s namespace.
- `tests/conftest.py` has a **session-scoped, autouse** `mock_settings` fixture. It must stay that way: `app/agents/pydantic_agent.py` calls `get_settings()` at import time, so a function-scoped fixture would be too late to prevent a real `.env` load during test collection.
- Run tests with `pytest tests/ -v --ignore=tests/test_ingestion.py` (or `make test`). `test_ingestion.py` is marked `@pytest.mark.integration` and needs live services — it's excluded from the default run and from CI.

## Long-running scripts — confirm before running, prefer background

Both of these are bottlenecked by Voyage AI's free-tier rate limit (3 RPM / 10K TPM), not by compute:

- `make ingest` (`python -m app.ingestion.ingest`): ~5 min for the default `INGEST_LIMIT=100`.
- `python scripts/evaluate_rag.py`: ~55-60 min total (dataset build + RAGAS metrics). Use `--eval-only` to skip the rebuild and reuse `scripts/.eval_cache.json` if only the judge/metrics config changed, not the questions or the assistant's prompt.

Both should be launched in the background and polled/monitored rather than run synchronously — they will blow past typical command timeouts. If the free-tier rate limit is exhausted from back-to-back runs, calls fail with a `RateLimitError` rather than queuing; wait ~60s before retrying.

## Digimon naming — verify, don't assume

DAPI's canonical names don't always match the "obvious" name a question would use. Concatenated western-fandom-style names (`MetalGreymon`) often don't exist — DAPI uses spaced names (`Metal Greymon`), sometimes with a disambiguating suffix (`Metal Greymon (Virus)`, `(X-Antibody)`, `(2010 Anime Version)`, ...). Before writing a golden eval question or assuming a name resolves:

- Check DAPI directly: `GET https://digi-api.com/api/v1/digimon?name=<name>`.
- Check it's actually in the local ingest (`INGEST_LIMIT=100` only pulls the first 100 by DAPI's list order, not by name/popularity): query Qdrant's `digimon_knowledge` collection by `payload.name`.
- Prefer a Digimon with **no name variants** in the ingested set for eval questions — retrieval is embedding-based, and multiple similarly-named/-themed entries (e.g. the `Greymon` family) can get pulled into the same top-k, which especially hurts RAGAS's rank-sensitive `context_precision`.

## Shared prompt surface

`PromptBuilder.SYSTEM_PROMPT` (`app/rag/prompt_builder.py`) is used by `/chat`, `/chat/stream`, **and** `scripts/evaluate_rag.py` (via `build_chat_prompt`). Any wording change there shifts RAGAS scores on the next eval run — when tuning the prompt, expect to re-run the eval to see the effect, not just the unit tests (which only assert the prompt is present as a substring, not its content).

## RAGAS evaluation harness gotcha

`scripts/evaluate_rag.py` defines `SymmetricVoyageEmbeddings`, a `VoyageAIEmbeddings` subclass that forces `input_type=None` for both `embed_query()` and `embed_documents()`. This exists because RAGAS's `ResponseRelevancy` metric embeds the original question with `embed_query()` and LLM-reconstructed questions with `embed_documents()` — Voyage's asymmetric retrieval embeddings put `"query"` and `"document"` in different subspaces, which compresses cosine similarity between two things that are actually both questions and artificially depresses `answer_relevancy`. This class is scoped to the eval script only — production retrieval (`app/rag/embedder.py`) correctly keeps the asymmetric query/document split, since that's a real retrieval task.
