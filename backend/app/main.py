"""FastAPI application entrypoint.

Run locally:
    uvicorn app.main:app --reload --port 8000
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

import app.models  # noqa: F401 — register tables on Base.metadata
from app.api.routes import cards, chat, health
from app.auth.router import router as auth_router
from app.core.config import settings
from app.db.session import Base, engine

logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Dev convenience: create tables if the DB is reachable.
    # Production migrations should use Alembic instead.
    if settings.debug:
        try:
            Base.metadata.create_all(bind=engine)
            logger.info("Database tables ensured (create_all)")
        except Exception as exc:
            logger.warning("Database unavailable at startup, skipping create_all: %s", exc)
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# Required by Authlib to hold OAuth state between login and callback.
app.add_middleware(SessionMiddleware, secret_key=settings.jwt_secret_key)

app.include_router(health.router, prefix=settings.api_v1_prefix)
app.include_router(auth_router, prefix=settings.api_v1_prefix)
app.include_router(chat.router, prefix=settings.api_v1_prefix)  # SSE streaming
app.include_router(cards.router, prefix=settings.api_v1_prefix)


@app.get("/")
def root() -> dict:
    return {"app": settings.app_name, "docs": "/docs"}
