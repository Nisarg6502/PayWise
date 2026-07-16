"""Embeddings, provider-switchable via EMBEDDING_PROVIDER.

- "jina" (default): Jina AI API — no local model download. One free API key
  (https://jina.ai) covers embeddings and reranking. Vectors are requested at
  768 dimensions (Matryoshka truncation) to match the Qdrant collection.
- "local": nomic-embed-text-v1.5 via sentence-transformers (~550 MB download).
"""

from functools import lru_cache

import httpx

from app.core.config import settings

EMBEDDING_DIM = 768

_JINA_EMBED_URL = "https://api.jina.ai/v1/embeddings"


def _jina_embed(texts: list[str], task: str) -> list[list[float]]:
    if not settings.jina_api_key:
        raise RuntimeError("JINA_API_KEY is not set (get a free key at https://jina.ai)")
    response = httpx.post(
        _JINA_EMBED_URL,
        headers={"Authorization": f"Bearer {settings.jina_api_key}"},
        json={
            "model": settings.embedding_model,
            "input": texts,
            "task": task,
            "dimensions": EMBEDDING_DIM,
            "normalized": True,
        },
        timeout=60,
    )
    response.raise_for_status()
    data = sorted(response.json()["data"], key=lambda item: item["index"])
    return [item["embedding"] for item in data]


@lru_cache
def _get_local_embedder():
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(settings.local_embedding_model, trust_remote_code=True)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed document chunks (768-dim)."""
    if settings.embedding_provider == "jina":
        return _jina_embed(texts, task="retrieval.passage")
    vectors = _get_local_embedder().encode(
        [f"search_document: {t}" for t in texts], normalize_embeddings=True
    )
    return [v.tolist() for v in vectors]


def embed_query(text: str) -> list[float]:
    """Embed a retrieval query (768-dim)."""
    if settings.embedding_provider == "jina":
        return _jina_embed([text], task="retrieval.query")[0]
    vector = _get_local_embedder().encode(
        f"search_query: {text}", normalize_embeddings=True
    )
    return vector.tolist()
