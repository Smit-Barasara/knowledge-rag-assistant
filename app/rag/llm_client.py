import anthropic
from typing import Dict, Any, List, Optional
from app.core.config import get_settings
import logging

logger = logging.getLogger(__name__)


class LLMClient:
    """Client for Anthropic Claude API."""

    def __init__(self):
        settings = get_settings()
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        self.model = settings.anthropic_model

    async def chat(
        self,
        prompt: str,
        max_tokens: int = 1024,
        history: Optional[List[Dict[str, str]]] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        """Send a message and get a completion. Pass `history` for multi-turn conversations."""
        try:
            messages = list(history) if history else []
            messages.append({"role": "user", "content": prompt})
            response = await self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                messages=messages,
                **kwargs
            )

            return {
                "content": response.content[0].text,
                "model": response.model,
                "usage": {
                    "prompt_tokens": response.usage.input_tokens,
                    "completion_tokens": response.usage.output_tokens,
                    "total_tokens": response.usage.input_tokens + response.usage.output_tokens,
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
            messages = list(history) if history else []
            messages.append({"role": "user", "content": prompt})
            async with self.client.messages.stream(
                model=self.model,
                max_tokens=1024,
                messages=messages,
                **kwargs,
            ) as stream:
                async for text in stream.text_stream:
                    yield {"type": "token", "text": text}
                message = await stream.get_final_message()
                yield {
                    "type": "done",
                    "usage": {
                        "prompt_tokens": message.usage.input_tokens,
                        "completion_tokens": message.usage.output_tokens,
                        "total_tokens": message.usage.input_tokens + message.usage.output_tokens,
                    },
                }
        except Exception as e:
            logger.error(f"Error in LLM stream: {e}")
            raise

    async def close(self):
        await self.client.close()
