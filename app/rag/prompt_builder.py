from typing import List, Dict, Any


class PromptBuilder:
    """Build prompts for LLM with RAG context."""
    
    SYSTEM_PROMPT = """You are a Digimon expert assistant. Answer concisely and factually \
using only the information in the provided context. Answer only what the question asks — \
if it asks about a specific aspect (e.g. level, type, attribute, skills, or evolutions), \
respond with only that aspect and do not add the Digimon's other attributes. Only give a \
full profile when the question is a general request (e.g. "tell me about X", "describe X"). \
Do not add closing questions, emojis, or information not present in the context. If the \
context does not contain the answer, say so briefly."""
    
    @staticmethod
    def build_context_message(query: str, context_chunks: List[Dict[str, Any]]) -> str:
        """User message with RAG context — no system prompt (pass SYSTEM_PROMPT separately)."""
        context_text = ""
        if context_chunks:
            context_text = "\n\nContext:\n"
            for i, chunk in enumerate(context_chunks, 1):
                chunk_text = chunk.get("payload", {}).get("chunk_text", "")
                digimon_name = chunk.get("payload", {}).get("name", "Unknown")
                context_text += f"\n{i}. {digimon_name}: {chunk_text}"

        return f"{context_text}\n\nQuestion: {query}"

    @staticmethod
    def build_chat_prompt(query: str, context_chunks: List[Dict[str, Any]]) -> str:
        """Single-turn prompt (system + context + question) — use for non-history calls."""
        context_message = PromptBuilder.build_context_message(query, context_chunks)
        return f"{PromptBuilder.SYSTEM_PROMPT}\n{context_message}\n\nPlease provide a helpful and accurate answer based on the context above."
