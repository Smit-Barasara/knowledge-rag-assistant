from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)

settings = get_settings()
_provider = OpenAIProvider(
    base_url="https://api.groq.com/openai/v1",
    api_key=settings.groq_api_key or None,
)
_model = OpenAIChatModel(settings.groq_model, provider=_provider)

agent = Agent(
    model=_model,
    system_prompt=(
        "You are an Indian rail travel guidance assistant. "
        "Use the guidance search tool and its official-source context before answering. "
        "Do not claim access to live schedules, availability, PNR status, bookings, or individual refund decisions. "
        "Mention when users should verify changing details directly with IRCTC or Indian Railways. "
        "If the sources do not answer, say so."
    ),
)


@agent.tool_plain
async def rag_search(query: str) -> str:
    """Search source-linked Indian rail travel guidance for a user question."""
    from app.rag.retriever import Retriever

    retriever = Retriever()
    try:
        chunks = await retriever.retrieve(query, limit=5)
        if not chunks:
            return "No relevant information found in the knowledge base."

        parts = []
        for i, chunk in enumerate(chunks, 1):
            chunk_text = chunk.get("payload", {}).get("chunk_text", "")
            payload = chunk.get("payload", {})
            name = payload.get("title", payload.get("name", "Unknown source"))
            score = chunk.get("score", 0)
            url = payload.get("source_url", "")
            checked = payload.get("last_verified", "unknown")
            parts.append(f"{i}. {name} (checked {checked}; {url}; relevance {score:.2f}): {chunk_text}")

        return "\n".join(parts)
    finally:
        await retriever.close()


@agent.tool_plain
async def get_guidance_document(document_id: int) -> str:
    """Retrieve the full source record for a guidance document by its archive ID."""
    from app.mcp.tools import MCPTools

    mcp = MCPTools()
    try:
        result = mcp.get_guidance_document(document_id)
        if not result:
            return f"No rail guidance document found with ID {document_id}."
        return (
            f"{result['title']} ({result['category']} · {result['topic']})\n"
            f"Source checked: {result['last_verified']}\n"
            f"Official source: {result['source_url']}\n"
            f"{result['content']}"
        )
    finally:
        await mcp.close()
