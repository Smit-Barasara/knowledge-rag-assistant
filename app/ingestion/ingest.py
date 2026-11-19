import asyncio
import json
import math
from pathlib import Path
from typing import Any

from qdrant_client.models import PointStruct
from app.core.config import get_settings
from app.db.postgres import PostgresManager
from app.db.qdrant import QdrantManager
from app.ingestion.embedder import Embedder

import logging

logger = logging.getLogger(__name__)
GUIDANCE_PATH = Path(__file__).with_name("rail_guidance.json")


def load_guidance_documents() -> list[dict[str, Any]]:
    """Load and validate the curated, source-linked rail guidance corpus."""
    with GUIDANCE_PATH.open(encoding="utf-8") as file:
        documents = json.load(file)

    required = {"id", "title", "category", "topic", "summary", "content", "source_url", "last_verified"}
    if not isinstance(documents, list) or not documents:
        raise ValueError(f"{GUIDANCE_PATH} must contain a non-empty list of documents.")

    ids: set[int] = set()
    for index, document in enumerate(documents):
        if not isinstance(document, dict) or not required.issubset(document):
            raise ValueError(f"Rail guidance document {index} is missing required fields.")
        if not isinstance(document["id"], int) or document["id"] in ids:
            raise ValueError(f"Rail guidance document {index} has a missing or duplicate integer id.")
        if not document["source_url"].startswith("https://"):
            raise ValueError(f"Rail guidance document {document['id']} must use an HTTPS source URL.")
        ids.add(document["id"])
    return documents


class DataIngestor:
    """Ingest the curated Indian rail guidance corpus into Qdrant and PostgreSQL."""

    def __init__(self):
        settings = get_settings()
        self.embedder = Embedder()
        self.qdrant = QdrantManager()
        self.postgres = PostgresManager()
        self.batch_size = settings.voyage_embed_batch_size
        self.rpm = settings.voyage_rpm

    async def _embed_all(self, texts: list[str]) -> list[list[float]]:
        """Embed all document texts in rate-limited batches."""
        if self.batch_size < 1 or self.rpm < 1:
            raise ValueError("VOYAGE_EMBED_BATCH_SIZE and VOYAGE_RPM must be positive.")

        delay = 60.0 / self.rpm
        total_batches = math.ceil(len(texts) / self.batch_size)
        logger.info(
            "Embedding %d guidance documents in %d batches (%d per batch, %d RPM)",
            len(texts),
            total_batches,
            self.batch_size,
            self.rpm,
        )

        embeddings: list[list[float]] = []
        for i in range(0, len(texts), self.batch_size):
            if i:
                await asyncio.sleep(delay)
            batch = texts[i : i + self.batch_size]
            logger.info("Embedding batch %d/%d (%d documents)", i // self.batch_size + 1, total_batches, len(batch))
            result = await self.embedder.embed_texts(batch, input_type="document")
            if len(result) != len(batch):
                raise RuntimeError("Embedding API returned an incomplete batch. Check the API key and rate limits.")
            embeddings.extend(result)
        return embeddings

    async def ingest(self) -> None:
        documents = load_guidance_documents()
        logger.info("Starting ingestion of %d rail guidance documents", len(documents))
        await self.qdrant.create_collection()
        self.postgres.create_tables()

        texts = [
            f"{document['title']}\nCategory: {document['category']}\nTopic: {document['topic']}\n"
            f"{document['summary']}\n\n{document['content']}"
            for document in documents
        ]
        embeddings = await self._embed_all(texts)

        points = [
            PointStruct(
                id=document["id"],
                vector=embedding,
                payload={
                    "document_id": document["id"],
                    "name": document["title"],
                    "title": document["title"],
                    "category": document["category"],
                    "topic": document["topic"],
                    "summary": document["summary"],
                    "source_url": document["source_url"],
                    "last_verified": document["last_verified"],
                    "chunk_index": 0,
                    "chunk_text": document["content"],
                },
            )
            for document, embedding in zip(documents, embeddings, strict=True)
        ]

        for i in range(0, len(points), 100):
            await self.qdrant.upsert_points(points[i : i + 100])

        self.postgres.upsert_rail_guidance_documents(documents)
        self.postgres.close()

        logger.info("Ingestion complete: %d official-source guidance documents indexed.", len(documents))


async def main():
    await DataIngestor().ingest()


if __name__ == "__main__":
    asyncio.run(main())
