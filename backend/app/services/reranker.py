"""Reranker, provider-switchable via RERANKER_PROVIDER.

- "jina" (default): Jina AI rerank API — no local model download.
- "local": bge-reranker-v2-m3 via sentence-transformers (~2.3 GB download).

Either way, failures degrade gracefully to dense-retrieval order so the
pipeline never dies on a reranking hiccup.
"""

import logging
from functools import lru_cache

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_JINA_RERANK_URL = "https://api.jina.ai/v1/rerank"


def _jina_rerank(query: str, chunks: list[dict], top_k: int) -> list[dict]:
    if not settings.jina_api_key:
        raise RuntimeError("JINA_API_KEY is not set (get a free key at https://jina.ai)")
    response = httpx.post(
        _JINA_RERANK_URL,
        headers={"Authorization": f"Bearer {settings.jina_api_key}"},
        json={
            "model": settings.reranker_model,
            "query": query,
            "documents": [chunk["text"] for chunk in chunks],
            "top_n": top_k,
            "return_documents": False,
        },
        timeout=60,
    )
    response.raise_for_status()
    return [
        {**chunks[result["index"]], "rerank_score": float(result["relevance_score"])}
        for result in response.json()["results"]
    ]


@lru_cache
def _get_local_reranker():
    from sentence_transformers import CrossEncoder

    return CrossEncoder(settings.local_reranker_model, max_length=8192)


def _local_rerank(query: str, chunks: list[dict], top_k: int) -> list[dict]:
    model = _get_local_reranker()
    scores = model.predict([(query, chunk["text"]) for chunk in chunks])
    ranked = sorted(zip(chunks, scores), key=lambda pair: pair[1], reverse=True)
    return [{**chunk, "rerank_score": float(score)} for chunk, score in ranked[:top_k]]


def rerank(query: str, chunks: list[dict], top_k: int = 3) -> list[dict]:
    """Return the top_k most relevant chunks for the query."""
    if not chunks:
        return []
    try:
        if settings.reranker_provider == "jina":
            return _jina_rerank(query, chunks, top_k)
        return _local_rerank(query, chunks, top_k)
    except Exception as exc:
        logger.warning(
            "Reranker unavailable (%s) — falling back to dense retrieval order", exc
        )
        return chunks[:top_k]
