from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture
def mock_groq_client():
    with patch("app.rag.llm_client.AsyncOpenAI") as mock_cls:
        mock_instance = MagicMock()
        mock_cls.return_value = mock_instance
        yield mock_instance


async def test_chat_returns_content_and_usage(mock_groq_client):
    from app.rag.llm_client import GROQ_BASE_URL, LLMClient

    mock_groq_client.chat.completions.create = AsyncMock(return_value=SimpleNamespace(
        choices=[SimpleNamespace(message=SimpleNamespace(content="Check the official rail guidance."))],
        model="openai/gpt-oss-120b",
        usage=SimpleNamespace(prompt_tokens=30, completion_tokens=10),
    ))

    client = LLMClient()
    result = await client.chat(
        "How do I cancel a ticket?",
        history=[{"role": "assistant", "content": "What ticket?"}],
        system="Answer from official sources.",
    )

    assert result == {
        "content": "Check the official rail guidance.",
        "model": "openai/gpt-oss-120b",
        "usage": {"prompt_tokens": 30, "completion_tokens": 10, "total_tokens": 40},
    }
    mock_groq_client.chat.completions.create.assert_awaited_once_with(
        model="openai/gpt-oss-120b",
        max_completion_tokens=1024,
        messages=[
            {"role": "system", "content": "Answer from official sources."},
            {"role": "assistant", "content": "What ticket?"},
            {"role": "user", "content": "How do I cancel a ticket?"},
        ],
    )
    assert GROQ_BASE_URL == "https://api.groq.com/openai/v1"


async def test_chat_raises_api_error(mock_groq_client):
    from app.rag.llm_client import LLMClient

    mock_groq_client.chat.completions.create = AsyncMock(side_effect=RuntimeError("API error"))

    with pytest.raises(RuntimeError, match="API error"):
        await LLMClient().chat("Any question?")


async def test_stream_yields_tokens_and_final_usage(mock_groq_client):
    from app.rag.llm_client import LLMClient

    class FakeStream:
        def __aiter__(self):
            async def chunks():
                yield SimpleNamespace(
                    choices=[SimpleNamespace(delta=SimpleNamespace(content="Check "))],
                    usage=None,
                )
                yield SimpleNamespace(
                    choices=[SimpleNamespace(delta=SimpleNamespace(content="IRCTC."))],
                    usage=None,
                )
                yield SimpleNamespace(
                    choices=[],
                    usage=SimpleNamespace(prompt_tokens=12, completion_tokens=4),
                )

            return chunks()

    mock_groq_client.chat.completions.create = AsyncMock(return_value=FakeStream())

    chunks = [
        chunk async for chunk in LLMClient().stream(
            "How do I check?",
            history=[{"role": "user", "content": "I booked a ticket."}],
            system="Be concise.",
        )
    ]

    assert chunks == [
        {"type": "token", "text": "Check "},
        {"type": "token", "text": "IRCTC."},
        {"type": "done", "usage": {"prompt_tokens": 12, "completion_tokens": 4, "total_tokens": 16}},
    ]
    mock_groq_client.chat.completions.create.assert_awaited_once_with(
        model="openai/gpt-oss-120b",
        max_completion_tokens=1024,
        messages=[
            {"role": "system", "content": "Be concise."},
            {"role": "user", "content": "I booked a ticket."},
            {"role": "user", "content": "How do I check?"},
        ],
        stream=True,
        stream_options={"include_usage": True},
    )


async def test_close_closes_groq_client(mock_groq_client):
    from app.rag.llm_client import LLMClient

    mock_groq_client.close = AsyncMock()
    await LLMClient().close()
    mock_groq_client.close.assert_awaited_once()
