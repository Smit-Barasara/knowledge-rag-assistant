from typing import List, Dict, Any


class PromptBuilder:
    """Build prompts for LLM with RAG context."""
    
    SYSTEM_PROMPT = """You are an Indian rail travel guidance assistant. Answer clearly and \
concisely using only the supplied official-source context. Distinguish general guidance from \
journey-specific or live information. Never claim to check train schedules, seat availability, \
PNR status, bookings, or individual refund eligibility. Do not calculate a refund or present \
changing rules as guaranteed; direct users to the linked official source to verify current \
requirements before acting. If the context does not contain the answer, say so briefly. Do not \
add unsupported facts, emojis, or a closing question."""
    
    @staticmethod
    def build_context_message(query: str, context_chunks: List[Dict[str, Any]]) -> str:
        """User message with RAG context — no system prompt (pass SYSTEM_PROMPT separately)."""
        context_text = ""
        if context_chunks:
            context_text = "\n\nContext:\n"
            for i, chunk in enumerate(context_chunks, 1):
                chunk_text = chunk.get("payload", {}).get("chunk_text", "")
                payload = chunk.get("payload", {})
                title = payload.get("title", payload.get("name", "Unknown source"))
                source_url = payload.get("source_url", "")
                last_verified = payload.get("last_verified", "unknown")
                context_text += (
                    f"\n{i}. {title} (source checked {last_verified}; {source_url}): {chunk_text}"
                )

        return f"{context_text}\n\nQuestion: {query}"

    @staticmethod
    def build_chat_prompt(query: str, context_chunks: List[Dict[str, Any]]) -> str:
        """Single-turn prompt (system + context + question) — use for non-history calls."""
        context_message = PromptBuilder.build_context_message(query, context_chunks)
        return f"{PromptBuilder.SYSTEM_PROMPT}\n{context_message}\n\nPlease provide a helpful and accurate answer based on the context above."
