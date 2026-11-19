# Railwise Project Overview

## Purpose

Railwise is a retrieval-augmented generation (RAG) application for general Indian rail travel guidance. It retrieves passages from a small, source-linked collection of official IRCTC guidance and uses them to help answer users' questions. The web app also provides a searchable archive of those guidance records.

The project demonstrates a complete AI application workflow: document ingestion, vector retrieval, grounded chat, conversation context, agent workflows, and a web interface.

## What users can do

- Ask questions about topics covered by the indexed guidance.
- Continue a conversation with follow-up questions.
- Filter questions and archive searches by category or topic.
- Browse source records and open their official IRCTC pages.
- Use the standard RAG chat, tool-calling assistant, or Corrective RAG workflow.

The current example corpus covers e-ticket cancellation and TDR guidance, Tatkal bookings, and e-ticket basics. The guidance is informational and is not a substitute for checking current IRCTC instructions.

## What Railwise does not do

Railwise is not connected to live railway or IRCTC services. It does not check train schedules, fares, seat availability, PNR status, or ticket bookings; it also cannot inspect a user's booking, calculate a refund, or decide a claim. Users should confirm changing rules and booking-specific details through official IRCTC channels.

## How a question is answered

1. The API loads the conversation context from Redis and makes a follow-up question self-contained when needed.
2. An input guard checks that the question is within the rail-guidance scope.
3. The retriever embeds the question and searches Qdrant for relevant document passages. Optional category and topic filters narrow the search.
4. The prompt builder combines retrieved source text with the question and instructions to answer within the evidence.
5. A Groq-hosted model generates the response through Groq's OpenAI-compatible API. The API returns the answer, source references, conversation ID, token usage, and latency; a streaming endpoint can return the response as server-sent events.
6. Conversation context and eligible fresh-query responses are cached in Redis. Langfuse can capture traces, and a background LLM judge can score responses.

The project also includes two agent workflows:

- **Tool-calling assistant:** a PydanticAI agent can use the project's rail-guidance tools.
- **Corrective RAG:** a LangGraph workflow retrieves passages, grades their relevance, rewrites the query when needed, retries within a bounded number of iterations, and generates a response.

## System architecture

```text
                         +----------------------+
                         | React + TypeScript UI |
                         +----------+-----------+
                                    |
                              HTTP / SSE
                                    |
                         +----------v-----------+
                         | FastAPI application   |
                         | chat, agents, archive |
                         +--+-------+--------+---+
                            |       |        |
                 +----------+       |        +----------+
                 |                  |                   |
          +------v------+    +------v------+      +-----v------+
          | Qdrant      |    | PostgreSQL  |      | Redis      |
          | vectors     |    | source data |      | context /  |
          +-------------+    +-------------+      | cache      |
                                                   +------------+
                            |
                 +----------+-----------+
                 | Groq / Voyage        |
                 | generation / vectors |
                 +----------------------+

                 Langfuse: optional tracing and evaluation
```

### Main components

| Component | Responsibility |
|---|---|
| React, TypeScript, Vite | Chat, guidance archive, and responsive user interface |
| FastAPI | Chat, streaming, agent, health, and archive endpoints |
| Voyage AI | Creates embeddings for corpus documents and user queries |
| Qdrant | Searches indexed vectors for relevant guidance passages |
| PostgreSQL | Stores source-linked guidance records used by the archive |
| Redis | Stores bounded conversation history and response cache entries |
| Groq-hosted model | Produces answers from the question and retrieved evidence |
| PydanticAI / LangGraph | Provide alternative tool-calling and corrective retrieval workflows |
| Langfuse | Optional tracing and response evaluation |
| Docker Compose / nginx | Runs local services and serves the web app while proxying API requests |

## Guidance corpus and ingestion

The curated corpus lives in [`../app/ingestion/rail_guidance.json`](../app/ingestion/rail_guidance.json). Each record contains a title, category, topic, summary, full guidance text, official source URL, and last-verified date.

The ingestion process validates the records, creates document embeddings, upserts vectors and metadata to Qdrant, and upserts source records to PostgreSQL. It does not crawl IRCTC or automatically refresh content. Update the curated records and re-run ingestion when the corpus needs maintenance.

## Key API routes

| Route | Purpose |
|---|---|
| `POST /api/v1/chat` | Grounded chat response |
| `POST /api/v1/chat/stream` | Stream a grounded response using SSE |
| `POST /api/v1/agent` | Tool-calling assistant |
| `POST /api/v1/agent/graph` | Corrective RAG workflow |
| `GET /api/v1/rail/guidance` | Search and filter guidance archive |
| `GET /api/v1/rail/guidance/filters` | List archive categories and topics |
| `GET /api/v1/rail/guidance/{id}` | Fetch one guidance record |
| `GET /api/v1/health` | API health check |

## Running the project

For Windows Docker setup, environment variables, and commands, see the [README setup instructions](../README.md#run-with-docker-on-windows). The web app is served locally at `http://localhost:8080`.

The hosted-model features require valid Groq and Voyage AI API keys. The archive and health endpoint do not require live train data or a railway integration.

## Further reading

- [Setup and test instructions](../README.md)
- [Frontend implementation notes](./FRONTEND_NOTES.md)
- [Official IRCTC e-ticket cancellation guide](https://contents.irctc.co.in/en/eticketCancel.html)
- [Official IRCTC Tatkal booking guide](https://contents.irctc.co.in/en/TatkalBooking.html)
- [Official IRCTC e-ticket guide](https://contents.irctc.co.in/en/bookEticket.html)
