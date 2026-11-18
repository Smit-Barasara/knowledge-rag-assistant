from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional
from app.rag.retriever import Retriever
from app.rag.prompt_builder import PromptBuilder
from app.rag.llm_client import LLMClient
from app.db.redis import RedisManager
from app.observability.langfuse import LangfuseManager
from app.observability.llm_judge import LLMJudge
from app.guardrails.input_guard import InputGuard, OFF_TOPIC_MESSAGE
import hashlib
import json
import time
import uuid
import logging

MAX_HISTORY_TURNS = 5  # Keep last 5 turns (10 messages) to bound prompt size

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["chat"])


class ChatRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=2000)
    conversation_id: Optional[str] = None
    level_filter: Optional[str] = None
    type_filter: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    conversation_id: str
    context_sources: list
    token_usage: dict
    latency_ms: int


async def _contextualize_query(query: str, history: list, llm_client) -> str:
    """Rewrite a follow-up question to be standalone so the retriever can find relevant chunks.

    E.g. "What are its digivolutions?" + Agumon history → "What are Agumon's digivolutions?"
    Falls back to the original query if the LLM call fails.
    """
    if not history:
        return query
    try:
        history_text = "\n".join(
            f"{m['role'].capitalize()}: {m['content']}" for m in history[-4:]
        )
        prompt = (
            f"Conversation so far:\n{history_text}\n\n"
            f"Follow-up question: {query}\n\n"
            "Rewrite the follow-up as a self-contained question with no pronouns (it, its, they, them). "
            "If it is already standalone, return it unchanged. Return only the question, nothing else."
        )
        rewritten = (await llm_client.chat(prompt, max_tokens=80))["content"].strip()
        if rewritten != query:
            logger.info(f"[history] contextualized: {query!r} → {rewritten!r}")
        return rewritten
    except Exception as e:
        logger.warning(f"[history] contextualization failed, using raw query: {e}")
        return query


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


async def _judge_response(trace_id: str, query: str, context_texts: list, answer: str) -> None:
    """Background task: LLM-as-judge scores sent to Langfuse after the response is returned."""
    judge = LLMJudge()
    langfuse = LangfuseManager()
    try:
        logger.info(f"[judge] evaluating trace {trace_id[:8]}…")
        scores = await judge.evaluate(query, context_texts, answer)
        if scores:
            for name, value in scores.items():
                langfuse.add_score(trace_id, name, value, comment="llm-judge")
            logger.info(f"[judge] scores added to trace {trace_id[:8]}: {scores}")
        else:
            logger.warning(f"[judge] evaluate() returned empty dict for trace {trace_id[:8]}")
    except Exception as e:
        logger.error(f"[judge] background task failed: {e}")
    finally:
        langfuse.flush()


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, background_tasks: BackgroundTasks):
    """Chat endpoint with RAG."""
    start_time = time.time()
    
    retriever = Retriever()
    llm_client = LLMClient()
    redis = RedisManager()
    langfuse = LangfuseManager()
    
    try:
        # Load conversation history first — needed to contextualize follow-up queries.
        conversation_id = request.conversation_id or str(uuid.uuid4())
        raw_history = await redis.get(f"conv:{conversation_id}")
        history: list = raw_history if isinstance(raw_history, list) else []
        if len(history) > MAX_HISTORY_TURNS * 2:
            history = history[-(MAX_HISTORY_TURNS * 2):]

        # Cache check for fresh sessions only (no history).
        # Contextualized answers are session-specific and must not be shared across
        # conversations — caching them under the raw query key would return the wrong
        # answer when a different user asks the same pronoun-based follow-up.
        cache_key = None
        if not history:
            query_hash = hashlib.sha256(request.query.encode()).hexdigest()[:16]
            filters_hash = hashlib.md5(
                json.dumps({"level": request.level_filter, "type": request.type_filter}, sort_keys=True).encode()
            ).hexdigest()[:8]
            cache_key = f"chat:{query_hash}:{filters_hash}"
            cached_response = await redis.get(cache_key)
            if cached_response:
                logger.info(f"Cache hit for query: {request.query}")
                cached_response["conversation_id"] = conversation_id
                cached_response["latency_ms"] = int((time.time() - start_time) * 1000)
                return ChatResponse(**cached_response)

        # Contextualize query before guardrail: "What are its skills?" →
        # "What are Agumon's skills?" so the guardrail sees the full intent.
        # No-op (and no LLM call) when history is empty.
        retrieval_query = await _contextualize_query(request.query, history, llm_client)

        # Guardrail — runs on the contextualized query so follow-up questions
        # about a previously discussed Digimon are never wrongly blocked.
        guard = InputGuard(llm_client)
        if not await guard.is_digimon_related(retrieval_query):
            raise HTTPException(status_code=400, detail=OFF_TOPIC_MESSAGE)

        # Build filters if provided
        filters = None
        if request.level_filter or request.type_filter:
            filters = {}
            if request.level_filter:
                filters["level"] = request.level_filter
            if request.type_filter:
                filters["type"] = request.type_filter

        # Retrieve relevant chunks
        retrieval_start = time.time()
        context_chunks = await retriever.retrieve(retrieval_query, limit=5, filters=filters)
        retrieval_latency = int((time.time() - retrieval_start) * 1000)
        
        # Trace retrieval
        avg_score = sum(c.get("score", 0) for c in context_chunks) / len(context_chunks) if context_chunks else 0
        langfuse.trace_retrieval(
            query=request.query,
            retrieved_count=len(context_chunks),
            avg_score=avg_score,
            latency_ms=retrieval_latency
        )
        
        # Build context-aware user message (system prompt passed separately so
        # it is not duplicated across history turns)
        user_message = PromptBuilder.build_context_message(request.query, context_chunks)

        # Get LLM response — history enables multi-turn conversation
        llm_response = await llm_client.chat(
            user_message,
            history=history,
            system=PromptBuilder.SYSTEM_PROMPT,
        )
        
        # Calculate latency
        latency_ms = int((time.time() - start_time) * 1000)
        
        # Extract context sources
        context_sources = [
            {
                "digimon_id": chunk.get("payload", {}).get("digimon_id"),
                "name": chunk.get("payload", {}).get("name"),
                "score": chunk.get("score")
            }
            for chunk in context_chunks
        ]
        
        # Save updated conversation history (plain query/answer, no context)
        history.append({"role": "user", "content": request.query})
        history.append({"role": "assistant", "content": llm_response["content"]})
        await redis.set(f"conv:{conversation_id}", history, ttl=3600)

        # Build response
        response = ChatResponse(
            response=llm_response["content"],
            conversation_id=conversation_id,
            context_sources=context_sources,
            token_usage=llm_response["usage"],
            latency_ms=latency_ms,
        )
        
        # Trace chat interaction and schedule LLM-as-judge in background
        trace_id = langfuse.trace_chat(
            query=request.query,
            response=llm_response["content"],
            context_chunks=context_chunks,
            token_usage=llm_response["usage"],
            latency_ms=latency_ms,
        )
        if trace_id:
            context_texts = [
                c.get("payload", {}).get("chunk_text", "")
                for c in context_chunks
                if c.get("payload", {}).get("chunk_text")
            ]
            if context_texts:
                background_tasks.add_task(
                    _judge_response, trace_id, request.query, context_texts, llm_response["content"]
                )

        # Cache the response (fresh sessions only — history-based answers are session-specific)
        if cache_key:
            await redis.set(cache_key, response.model_dump(), ttl=86400)

        return response

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

    finally:
        await retriever.close()
        await llm_client.close()
        await redis.close()
        langfuse.flush()


@router.post("/chat/stream")
async def chat_stream(request: ChatRequest):
    """Streaming chat endpoint — returns SSE tokens as they are generated.

    HTTPException cannot be raised inside an async generator, so guardrail
    and retrieval run before the StreamingResponse is created.
    """
    # Conversation history
    conversation_id = request.conversation_id or str(uuid.uuid4())
    redis_pre = RedisManager()
    try:
        raw_hist = await redis_pre.get(f"conv:{conversation_id}")
        history: list = raw_hist if isinstance(raw_hist, list) else []
        if len(history) > MAX_HISTORY_TURNS * 2:
            history = history[-(MAX_HISTORY_TURNS * 2):]
    finally:
        await redis_pre.close()

    # Contextualize then guard — both share one LLMClient.
    # Contextualize first so follow-up pronouns are resolved before
    # the guardrail evaluates the query.
    llm_client = LLMClient()
    try:
        retrieval_query = await _contextualize_query(request.query, history, llm_client)
        guard = InputGuard(llm_client)
        if not await guard.is_digimon_related(retrieval_query):
            raise HTTPException(status_code=400, detail=OFF_TOPIC_MESSAGE)
    finally:
        await llm_client.close()

    # Retrieval
    retriever = Retriever()
    try:
        filters = None
        if request.level_filter or request.type_filter:
            filters = {}
            if request.level_filter:
                filters["level"] = request.level_filter
            if request.type_filter:
                filters["type"] = request.type_filter
        context_chunks = await retriever.retrieve(retrieval_query, limit=5, filters=filters)
    finally:
        await retriever.close()

    user_message = PromptBuilder.build_context_message(request.query, context_chunks)

    async def generate():
        client = LLMClient()
        langfuse = LangfuseManager()
        redis = RedisManager()
        start_time = time.time()
        full_text = []
        try:
            # Additive event: lets the UI render citations before/while tokens stream.
            yield f"data: {json.dumps({'sources': _sources_from_chunks(context_chunks)})}\n\n"
            async for chunk in client.stream(user_message, history=history, system=PromptBuilder.SYSTEM_PROMPT):
                if chunk["type"] == "token":
                    full_text.append(chunk["text"])
                    yield f"data: {json.dumps({'token': chunk['text']})}\n\n"
                elif chunk["type"] == "done":
                    latency_ms = int((time.time() - start_time) * 1000)
                    full_response = "".join(full_text)

                    # Persist conversation history
                    history.append({"role": "user", "content": request.query})
                    history.append({"role": "assistant", "content": full_response})
                    await redis.set(f"conv:{conversation_id}", history, ttl=3600)

                    langfuse.trace_chat(
                        query=request.query,
                        response=full_response,
                        context_chunks=context_chunks,
                        token_usage=chunk["usage"],
                        latency_ms=latency_ms,
                    )
                    langfuse.flush()
                    yield f"data: {json.dumps({'done': True, 'conversation_id': conversation_id, 'latency_ms': latency_ms, 'usage': chunk['usage']})}\n\n"
        except Exception as e:
            logger.error(f"Error in streaming chat: {e}")
            yield f"data: {json.dumps({'error': 'Internal server error'})}\n\n"
        finally:
            await client.close()
            await redis.close()
            langfuse.flush()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
