import pytest
from unittest.mock import patch, AsyncMock, MagicMock


@pytest.fixture(autouse=True, scope="session")
def mock_settings():
    """Mock settings for all tests — prevents loading .env or calling external services.

    Session-scoped and autouse because pydantic_agent.py calls get_settings() at import time.
    """
    from app.core.config import Settings

    fake = Settings(
        groq_api_key="test-groq-key",
        groq_model="openai/gpt-oss-120b",
        voyage_api_key="test-voyage-key",
        langfuse_public_key="",
        langfuse_secret_key="",
        langfuse_host="http://localhost:3000",
    )
    with patch("app.core.config.get_settings", return_value=fake):
        yield fake


@pytest.fixture(scope="module")
def mock_database_startup():
    with patch("app.api.main.PostgresManager") as manager_cls:
        yield manager_cls


@pytest.fixture
def sample_chunks():
    """Realistic Qdrant search result chunks."""
    return [
        {
            "id": 10,
            "score": 0.92,
            "payload": {
                "document_id": 1,
                "name": "Cancelling an IRCTC e-ticket",
                "title": "Cancelling an IRCTC e-ticket",
                "category": "Tickets",
                "topic": "Cancellation and refunds",
                "source_url": "https://contents.irctc.co.in/en/eticketCancel.html",
                "last_verified": "2026-11-18",
                "chunk_index": 0,
                "chunk_text": "An e-ticket can be cancelled online before reservation-chart preparation.",
            },
        },
    ]


@pytest.fixture
def mock_llm_response():
    """Minimal LLMClient.chat() return value."""
    return {
        "content": "Check the current IRCTC cancellation guidance before acting.",
        "model": "claude-haiku-4-5-20251001",
        "usage": {
            "prompt_tokens": 50,
            "completion_tokens": 20,
            "total_tokens": 70,
        },
    }
