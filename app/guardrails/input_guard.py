from app.rag.llm_client import LLMClient
import logging

logger = logging.getLogger(__name__)

_CLASSIFICATION_PROMPT = """\
You are a query classifier. Determine if the following question is related to \
Indian rail passenger travel, such as train search, tickets, reservation, Tatkal, \
waitlist/RAC, cancellation, refunds, or official rail travel guidance).

Question: {query}

Reply with ONLY the word YES if it is related, or ONLY the word NO if it is not."""

OFF_TOPIC_MESSAGE = (
    "I can help with general Indian rail travel guidance from the sources in this project. "
    "I can't check live schedules, seat availability, PNR status, make bookings, or determine "
    "an individual refund outcome."
)


class InputGuard:
    """Classify queries as rail-related before forwarding to the RAG pipeline."""

    def __init__(self, llm_client: LLMClient):
        self._llm = llm_client

    async def is_rail_related(self, query: str) -> bool:
        """Return True if the query concerns Indian passenger rail travel.

        Fail-open: returns True on any LLM error to avoid cascading failures.
        """
        try:
            result = await self._llm.chat(
                _CLASSIFICATION_PROMPT.format(query=query),
                max_tokens=128,
            )
            answer = result.get("content", "").strip().lower()
            return answer == "yes"
        except Exception as e:
            logger.warning(f"Guardrail classification failed (fail-open): {e}")
            return True
