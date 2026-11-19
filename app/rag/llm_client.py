from openai import AsyncOpenAI
from typing import Dict, Any, List, Optional
from app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)

GROQ_BASE_URL = "https://api.groq.com/openai/v1"


class LLMClient:
    """Client for Groq's OpenAI-compatible chat completions API."""

    def __init__(self):
        settings = get_settings()
        self.client = AsyncOpenAI(
            api_key=settings.groq_api_key or "not-configured",
            base_url=GROQ_BASE_URL,
        )
        self.model = settings.groq_model

    @staticmethod
    def _messages(
        prompt: str,
        history: Optional[List[Dict[str, str]]],
        system: Optional[str],
    ) -> List[Dict[str, str]]:
        messages = [{"role": "system", "content": system}] if system else []
        messages.extend(history or [])
        messages.append({"role": "user", "content": prompt})
        return messages

    async def chat(
        self,
        prompt: str,
        max_tokens: int = 1024,
        history: Optional[List[Dict[str, str]]] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Send a message and get a completion. Pass `history` for multi-turn conversations."""
        try:
            system = kwargs.pop("system", None)
            response = await self.client.chat.completions.create(
                model=self.model,
                max_completion_tokens=max_tokens,
                messages=self._messages(prompt, history, system),
                **kwargs
            )

            usage = response.usage
            prompt_tokens = usage.prompt_tokens if usage else 0
            completion_tokens = usage.completion_tokens if usage else 0
            return {
                "content": response.choices[0].message.content or "",
                "model": response.model,
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": prompt_tokens + completion_tokens,
                },
            }
        except Exception as e:
            logger.error(f"Error in LLM chat: {e}")
            raise

    async def stream(
        self,
        prompt: str,
        history: Optional[List[Dict[str, str]]] = None,
        **kwargs,
    ):
        """Yield token chunks, then a final usage dict.

        Each yielded value is either {"type": "token", "text": str}
        or {"type": "done", "usage": {...}}.
        """
        try:
            system = kwargs.pop("system", None)
            stream = await self.client.chat.completions.create(
                model=self.model,
                max_completion_tokens=1024,
                messages=self._messages(prompt, history, system),
                stream=True,
                stream_options={"include_usage": True},
                **kwargs,
            )
            usage = None
            async for chunk in stream:
                if chunk.choices:
                    text = chunk.choices[0].delta.content
                    if text:
                        yield {"type": "token", "text": text}
                if chunk.usage:
                    usage = chunk.usage

            prompt_tokens = usage.prompt_tokens if usage else 0
            completion_tokens = usage.completion_tokens if usage else 0
            yield {
                "type": "done",
                "usage": {
                    "prompt_tokens": prompt_tokens,
                    "completion_tokens": completion_tokens,
                    "total_tokens": prompt_tokens + completion_tokens,
                },
            }
        except Exception as e:
            logger.error(f"Error in LLM stream: {e}")
            raise

    async def close(self):
        await self.client.close()
