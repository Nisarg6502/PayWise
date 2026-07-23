"""LLM chat, provider-switchable via LLM_PROVIDER.

- "ollama" (default): Ollama cloud API (gpt-oss:120b on the free tier).
- "hf": Qwen3 via Hugging Face Inference Providers' OpenAI-compatible
  router (needs HF_TOKEN; free accounts get small monthly credits).

Embeddings live in app.services.embeddings (Jina API); Ollama cloud does
not host embedding models.
"""

import re
from functools import lru_cache

import httpx
from ollama import Client

from app.core.config import settings

_HF_ROUTER_URL = "https://router.huggingface.co/v1/chat/completions"


@lru_cache
def get_ollama() -> Client:
    headers = {}
    if settings.ollama_api_key:
        headers["Authorization"] = f"Bearer {settings.ollama_api_key}"
    return Client(host=settings.ollama_base_url, headers=headers)


def _hf_chat(messages: list[dict], temperature: float) -> str:
    if not settings.hf_token:
        raise RuntimeError("HF_TOKEN is not set (create one at https://hf.co/settings/tokens)")
    response = httpx.post(
        _HF_ROUTER_URL,
        headers={"Authorization": f"Bearer {settings.hf_token}"},
        json={
            "model": settings.hf_llm_model,
            "messages": messages,
            "temperature": temperature,
        },
        timeout=120,
    )
    response.raise_for_status()
    return response.json()["choices"][0]["message"]["content"]


def _strip_thinking(text: str) -> str:
    """Remove <think>...</think> blocks emitted by reasoning models (e.g. Qwen3)."""
    return re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()


def chat(
    system: str,
    user: str | None = None,
    messages: list[dict] | None = None,
    temperature: float = 0.1,
) -> str:
    """Chat completion via the configured provider.

    Either pass `user` (single-turn) or `messages` (a full history list,
    the last entry being the current turn) — `messages` takes precedence
    if both are given.
    """
    if messages is None:
        messages = [{"role": "user", "content": user or ""}]
    messages = [{"role": "system", "content": system}] + messages
    if settings.llm_provider == "hf":
        return _strip_thinking(_hf_chat(messages, temperature))
    response = get_ollama().chat(
        model=settings.llm_model,
        messages=messages,
        options={"temperature": temperature},
    )
    return _strip_thinking(response["message"]["content"])
