"""Qdrant client and collection management for card reward rules."""

from functools import lru_cache

from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance,
    FieldCondition,
    Filter,
    MatchAny,
    PayloadSchemaType,
    VectorParams,
)

from app.core.config import settings

EMBEDDING_DIM = 768  # nomic-embed-text-v1.5


@lru_cache
def get_qdrant() -> QdrantClient:
    return QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)


def ensure_collection() -> None:
    """Create the rules collection (idempotent) with a keyword index on card_id."""
    client = get_qdrant()
    if not client.collection_exists(settings.qdrant_collection):
        client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=VectorParams(size=EMBEDDING_DIM, distance=Distance.COSINE),
        )
        client.create_payload_index(
            collection_name=settings.qdrant_collection,
            field_name="card_id",
            field_schema=PayloadSchemaType.KEYWORD,
        )


def owned_cards_filter(owned_card_ids: list[str]) -> Filter:
    """Strict payload filter: only chunks belonging to cards the user owns."""
    return Filter(
        must=[FieldCondition(key="card_id", match=MatchAny(any=owned_card_ids))]
    )
