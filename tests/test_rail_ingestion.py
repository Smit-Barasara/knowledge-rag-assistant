import json
from unittest.mock import AsyncMock, patch

import pytest

from app.ingestion import ingest


def test_curated_rail_corpus_has_source_metadata():
    documents = ingest.load_guidance_documents()
    assert len(documents) >= 3
    assert len({document["id"] for document in documents}) == len(documents)
    assert all(document["source_url"].startswith("https://") for document in documents)
    assert all(document["last_verified"] for document in documents)


def test_corpus_loader_rejects_duplicate_ids(tmp_path):
    duplicate = [
        {
            "id": 1,
            "title": "A",
            "category": "Tickets",
            "topic": "Cancellation",
            "summary": "Summary",
            "content": "Content",
            "source_url": "https://example.org/a",
            "last_verified": "2026-11-18",
        },
        {
            "id": 1,
            "title": "B",
            "category": "Tickets",
            "topic": "Cancellation",
            "summary": "Summary",
            "content": "Content",
            "source_url": "https://example.org/b",
            "last_verified": "2026-11-18",
        },
    ]
    corpus = tmp_path / "rail_guidance.json"
    corpus.write_text(json.dumps(duplicate), encoding="utf-8")
    with patch.object(ingest, "GUIDANCE_PATH", corpus), pytest.raises(ValueError, match="duplicate"):
        ingest.load_guidance_documents()


@pytest.mark.asyncio
async def test_embedding_batches_return_one_vector_per_document(mock_settings):
    ingestor = ingest.DataIngestor()
    ingestor.batch_size = 2
    ingestor.rpm = 100000
    ingestor.embedder.embed_texts = AsyncMock(side_effect=[[[0.1] * 1024] * 2, [[0.2] * 1024]])
    result = await ingestor._embed_all(["one", "two", "three"])
    assert len(result) == 3
    assert len(result[0]) == 1024
    assert ingestor.embedder.embed_texts.await_count == 2


@pytest.mark.asyncio
async def test_embedding_batch_failure_is_explicit(mock_settings):
    ingestor = ingest.DataIngestor()
    ingestor.embedder.embed_texts = AsyncMock(return_value=[])
    with pytest.raises(RuntimeError, match="incomplete batch"):
        await ingestor._embed_all(["one"])
