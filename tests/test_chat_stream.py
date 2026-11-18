import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient


async def _mock_stream(*args, **kwargs):
    yield {"type": "token", "text": "Agumon"}
    yield {"type": "token", "text": " is a Rookie Digimon."}
    yield {"type": "done", "usage": {"prompt_tokens": 30, "completion_tokens": 10, "total_tokens": 40}}





@pytest.fixture(scope="module")
def stream_client():
    with (
        patch("app.api.routes.chat.Retriever") as mock_retriever_cls,
        patch("app.api.routes.chat.LLMClient") as mock_llm_cls,
        patch("app.api.routes.chat.RedisManager") as mock_redis_cls,
        patch("app.api.routes.chat.LangfuseManager") as mock_langfuse_cls,
        patch("app.api.routes.chat.InputGuard") as mock_guard_cls,
        patch("app.api.routes.chat.LLMJudge") as mock_judge_cls,
    ):
        retriever_instance = MagicMock()
        retriever_instance.retrieve = AsyncMock(return_value=[
            {
                "id": 1,
                "score": 0.9,
                "payload": {"digimon_id": 1, "name": "Agumon", "chunk_text": "Agumon is a Rookie."},
            }
        ])
        retriever_instance.close = AsyncMock()
        mock_retriever_cls.return_value = retriever_instance

        llm_instance = MagicMock()
        llm_instance.chat = AsyncMock(return_value={
            "content": "Agumon is a Rookie Digimon.",
            "model": "claude-haiku-4-5-20251001",
            "usage": {"prompt_tokens": 30, "completion_tokens": 10, "total_tokens": 40},
        })
        llm_instance.stream = _mock_stream
        llm_instance.close = AsyncMock()
        mock_llm_cls.return_value = llm_instance

        redis_instance = MagicMock()
        redis_instance.get = AsyncMock(return_value=None)
        redis_instance.set = AsyncMock()
        redis_instance.close = AsyncMock()
        mock_redis_cls.return_value = redis_instance

        guard_instance = MagicMock()
        guard_instance.is_digimon_related = AsyncMock(return_value=True)
        mock_guard_cls.return_value = guard_instance

        langfuse_instance = MagicMock()
        langfuse_instance.trace_chat = MagicMock(return_value="mock-trace-id")
        langfuse_instance.add_score = MagicMock()
        langfuse_instance.flush = MagicMock()
        mock_langfuse_cls.return_value = langfuse_instance

        judge_instance = MagicMock()
        judge_instance.evaluate = AsyncMock(
            return_value={"faithfulness": 0.9, "relevance": 0.85, "context_relevance": 0.88}
        )
        mock_judge_cls.return_value = judge_instance

        from app.api.main import app
        with TestClient(app) as client:
            yield client


def test_chat_stream_returns_200(stream_client):
    with stream_client.stream("POST", "/api/v1/chat/stream", json={"query": "Tell me about Agumon"}) as response:
        assert response.status_code == 200


def test_chat_stream_content_type(stream_client):
    with stream_client.stream("POST", "/api/v1/chat/stream", json={"query": "Tell me about Agumon"}) as response:
        assert "text/event-stream" in response.headers["content-type"]


def test_chat_stream_yields_sse_chunks(stream_client):
    with stream_client.stream("POST", "/api/v1/chat/stream", json={"query": "Tell me about Agumon"}) as response:
        body = b"".join(response.iter_bytes())
    assert b"data:" in body
    assert b'"token"' in body
    assert b'"done"' in body


def test_chat_stream_emits_sources_event_before_tokens(stream_client):
    import json
    with stream_client.stream("POST", "/api/v1/chat/stream", json={"query": "Tell me about Agumon"}) as response:
        body = b"".join(response.iter_bytes()).decode()
    events = [json.loads(b[len("data: "):]) for b in body.split("\n\n") if b.startswith("data: ")]
    assert "sources" in events[0]
    assert events[0]["sources"][0]["name"] == "Agumon"
    assert any("token" in e for e in events)
    done = events[-1]
    assert done["done"] is True and done["conversation_id"]
    assert done["usage"]["total_tokens"] == 40


def test_chat_stream_sets_proxy_friendly_headers(stream_client):
    with stream_client.stream("POST", "/api/v1/chat/stream", json={"query": "Tell me about Agumon"}) as response:
        assert response.headers["cache-control"] == "no-cache"
        assert response.headers["x-accel-buffering"] == "no"
