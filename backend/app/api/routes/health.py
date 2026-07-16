"""Health / readiness endpoints — verify PostgreSQL and Qdrant connectivity."""

from fastapi import APIRouter
from qdrant_client import QdrantClient
from sqlalchemy import text

from app.core.config import settings
from app.db.session import engine

router = APIRouter(tags=["health"])


@router.get("/health")
def health() -> dict:
    """Liveness probe."""
    return {"status": "ok", "app": settings.app_name}


@router.get("/health/ready")
def readiness() -> dict:
    """Readiness probe — checks PostgreSQL and Qdrant connections."""
    checks: dict[str, str] = {}

    database_label = engine.dialect.name  # "postgresql" or "sqlite" (dev override)
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        checks[database_label] = "ok"
    except Exception as exc:  # pragma: no cover
        checks[database_label] = f"error: {exc}"

    try:
        client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key)
        client.get_collections()
        checks["qdrant"] = "ok"
    except Exception as exc:  # pragma: no cover
        checks["qdrant"] = f"error: {exc}"

    status = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return {"status": status, "checks": checks}
