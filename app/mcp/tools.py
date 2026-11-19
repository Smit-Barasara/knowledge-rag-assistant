from typing import Any

from app.db.postgres import PostgresManager, RailGuidanceDocument
from app.rag.retriever import Retriever


class MCPTools:
    """Source-aware tools for Indian rail travel guidance."""

    def __init__(self):
        self.postgres = PostgresManager()

    async def search_guidance(self, query: str) -> list[dict[str, Any]]:
        retriever = Retriever()
        try:
            chunks = await retriever.retrieve(query, limit=5)
            return [
                {
                    "document_id": chunk.get("payload", {}).get("document_id"),
                    "title": chunk.get("payload", {}).get("title", chunk.get("payload", {}).get("name")),
                    "source_url": chunk.get("payload", {}).get("source_url"),
                    "last_verified": chunk.get("payload", {}).get("last_verified"),
                    "content": chunk.get("payload", {}).get("chunk_text"),
                    "score": chunk.get("score"),
                }
                for chunk in chunks
            ]
        finally:
            await retriever.close()

    def get_guidance_document(self, document_id: int) -> dict[str, Any] | None:
        session = self.postgres.get_session()
        try:
            document = (
                session.query(RailGuidanceDocument)
                .filter(RailGuidanceDocument.id == document_id)
                .first()
            )
            if not document:
                return None
            return {
                "id": document.id,
                "title": document.title,
                "category": document.category,
                "topic": document.topic,
                "summary": document.summary,
                "content": document.content,
                "source_url": document.source_url,
                "last_verified": document.last_verified,
            }
        finally:
            session.close()

    async def close(self):
        self.postgres.close()
