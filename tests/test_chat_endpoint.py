import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


@pytest.fixture(scope="module")
def app_client(mock_database_startup):
    """TestClient with all external dependencies mocked."""
    with (
        patch("app.api.routes.chat.Retriever") as mock_retriever_cls,
        patch("app.api.routes.chat.LLMClient") as mock_llm_cls,
        patch("app.api.routes.chat.RedisManager") as mock_redis_cls,
        patch("app.api.routes.chat.LangfuseManager") as mock_langfuse_cls,
        patch("app.api.routes.chat.InputGuard") as mock_guard_cls,
        patch("app.api.routes.chat.LLMJudge") as mock_judge_cls,
    ):
        # Retriever mock
        retriever_instance = MagicMock()
        retriever_instance.retrieve = AsyncMock(return_value=[
            {
                "id": 10,
                "score": 0.92,
                "payload": {
                    "document_id": 1,
                    "name": "Cancelling an IRCTC e-ticket",
                    "category": "Tickets",
                    "topic": "Cancellation and refunds",
                    "chunk_text": "Check the current IRCTC cancellation guidance before acting.",
                },
            }
        ])
        retriever_instance.close = AsyncMock()
        mock_retriever_cls.return_value = retriever_instance

        # LLMClient mock
        llm_instance = MagicMock()
        llm_instance.chat = AsyncMock(return_value={
            "content": "Check the current IRCTC cancellation guidance before acting.",
            "model": "claude-haiku-4-5-20251001",
            "usage": {"prompt_tokens": 50, "completion_tokens": 20, "total_tokens": 70},
        })
        llm_instance.close = AsyncMock()
        mock_llm_cls.return_value = llm_instance

        # Guardrail mock — always allow through in tests
        guard_instance = MagicMock()
        guard_instance.is_rail_related = AsyncMock(return_value=True)
        mock_guard_cls.return_value = guard_instance

        # Redis mock — cache miss and empty history by default
        redis_instance = MagicMock()
        redis_instance.get = AsyncMock(return_value=None)
        redis_instance.set = AsyncMock()
        redis_instance.close = AsyncMock()
        mock_redis_cls.return_value = redis_instance

        # Langfuse mock — trace methods are sync (no await); trace_chat returns a trace ID
        langfuse_instance = MagicMock()
        langfuse_instance.trace_retrieval = MagicMock()
        langfuse_instance.trace_chat = MagicMock(return_value="mock-trace-id")
        langfuse_instance.add_score = MagicMock()
        langfuse_instance.flush = MagicMock()
        mock_langfuse_cls.return_value = langfuse_instance

        # LLMJudge mock — evaluate returns faithfulness + relevance scores
        judge_instance = MagicMock()
        judge_instance.evaluate = AsyncMock(
            return_value={"faithfulness": 0.9, "relevance": 0.85, "context_relevance": 0.88}
        )
        mock_judge_cls.return_value = judge_instance

        from app.api.main import app
        with TestClient(app) as client:
            yield client, redis_instance


def test_chat_returns_200(app_client):
    client, _ = app_client
    response = client.post("/api/v1/chat", json={"query": "How do I cancel an e-ticket?"})
    assert response.status_code == 200


def test_chat_response_structure(app_client):
    client, _ = app_client
    response = client.post("/api/v1/chat", json={"query": "How do I cancel an e-ticket?"})
    data = response.json()
    assert "response" in data
    assert "conversation_id" in data
    assert "context_sources" in data
    assert "token_usage" in data
    assert "latency_ms" in data


def test_chat_cache_hit(app_client):
    client, redis_instance = app_client
    cached = {
        "response": "Cached answer.",
        "conversation_id": "cached-conv-id",
        "context_sources": [],
        "token_usage": {},
        "latency_ms": 5,
    }
    redis_instance.get = AsyncMock(return_value=cached)

    response = client.post("/api/v1/chat", json={"query": "How do refunds work?"})
    assert response.status_code == 200
    assert response.json()["response"] == "Cached answer."

    # Reset to cache miss for other tests
    redis_instance.get = AsyncMock(return_value=None)


def test_chat_with_filters(app_client):
    client, _ = app_client
    response = client.post(
        "/api/v1/chat",
        json={"query": "How do I cancel an e-ticket?", "category_filter": "Tickets"},
    )
    assert response.status_code == 200
