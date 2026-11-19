from unittest.mock import AsyncMock, MagicMock

import pytest

from app.api.routes.chat import _contextualize_query


@pytest.mark.asyncio
async def test_contextualization_uses_original_query_when_model_returns_empty():
    llm_client = MagicMock()
    llm_client.chat = AsyncMock(return_value={"content": ""})

    query = "How do I book a train ticket through IRCTC?"
    history = [{"role": "user", "content": "hi"}]

    assert await _contextualize_query(query, history, llm_client) == query
    llm_client.chat.assert_awaited_once()
    assert llm_client.chat.await_args.kwargs["max_tokens"] == 256


@pytest.mark.asyncio
async def test_contextualization_uses_rewritten_query_when_available():
    llm_client = MagicMock()
    llm_client.chat = AsyncMock(
        return_value={"content": "When does IRCTC Tatkal booking open?"}
    )

    result = await _contextualize_query(
        "When does it open?",
        [{"role": "user", "content": "What is IRCTC Tatkal booking?"}],
        llm_client,
    )

    assert result == "When does IRCTC Tatkal booking open?"
