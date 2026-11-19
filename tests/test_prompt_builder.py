from app.rag.prompt_builder import PromptBuilder


def test_build_chat_prompt_includes_query():
    prompt = PromptBuilder.build_chat_prompt("How do I cancel an e-ticket?", [])
    assert "How do I cancel an e-ticket?" in prompt


def test_build_chat_prompt_with_context_includes_chunk_text(sample_chunks):
    prompt = PromptBuilder.build_chat_prompt("How do I cancel an e-ticket?", sample_chunks)
    assert "An e-ticket can be cancelled online before reservation-chart preparation." in prompt
    assert "https://contents.irctc.co.in/en/eticketCancel.html" in prompt
    assert "2026-11-18" in prompt


def test_build_chat_prompt_without_context_still_valid():
    prompt = PromptBuilder.build_chat_prompt("Any question", [])
    assert isinstance(prompt, str)
    assert len(prompt) > 0
    assert PromptBuilder.SYSTEM_PROMPT in prompt
