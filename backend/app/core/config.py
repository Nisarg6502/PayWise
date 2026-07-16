"""Application settings, loaded from environment variables / .env file."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- App ---
    app_name: str = "LangGraph Credit Card Optimizer"
    debug: bool = True
    api_v1_prefix: str = "/api/v1"
    frontend_origin: str = "http://localhost:3000"

    # --- Database ---
    # Set DATABASE_URL to override the assembled PostgreSQL URL entirely
    # (e.g. "sqlite:///./dev.db" for Docker-less local development).
    database_url_override: str | None = Field(default=None, validation_alias="DATABASE_URL")
    postgres_user: str = "ccopt"
    postgres_password: str = "ccopt_dev_password"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "ccopt"

    # --- Qdrant ---
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str | None = None
    qdrant_collection: str = "card_rules"

    # --- Models ---
    # LLM runs on the Ollama cloud API. Ollama cloud hosts no embedding models,
    # so embeddings + reranking use the Jina AI API by default (one free key
    # covers both: https://jina.ai). Set providers to "local" to run
    # nomic-embed-text / bge-reranker via sentence-transformers instead.
    llm_provider: str = "ollama"                  # "ollama" | "hf"
    ollama_base_url: str = "https://ollama.com"
    ollama_api_key: str | None = None
    llm_model: str = "gpt-oss:120b"               # Ollama cloud free tier
    hf_token: str | None = None                   # for LLM_PROVIDER=hf
    hf_llm_model: str = "Qwen/Qwen3-32B"          # Qwen3 via HF Inference Providers

    jina_api_key: str | None = None
    embedding_provider: str = "jina"              # "jina" | "local"
    embedding_model: str = "jina-embeddings-v3"   # 768-dim via Matryoshka truncation
    local_embedding_model: str = "nomic-ai/nomic-embed-text-v1.5"
    reranker_provider: str = "jina"               # "jina" | "local"
    reranker_model: str = "jina-reranker-v3"
    local_reranker_model: str = "BAAI/bge-reranker-v2-m3"

    # --- Google OAuth 2.0 / JWT (Phase 2) ---
    google_client_id: str = ""
    google_client_secret: str = ""
    jwt_secret_key: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    @property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
