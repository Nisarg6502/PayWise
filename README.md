# LangGraph Credit Card Optimizer

Stateful multi-agent system that recommends the best credit card for a purchase, based on the user's owned cards and RAG over card reward rules.

## Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (REST + SSE streaming) |
| Frontend | Next.js PWA (Phase 5) |
| Relational DB | PostgreSQL on Neon (SQLAlchemy; local Docker optional) |
| Vector DB | Qdrant Cloud (local Docker optional) |
| Auth | Google OAuth 2.0 → JWT |
| Orchestration | LangGraph |
| LLM / Router | gpt-oss:120b via Ollama cloud API |
| Embeddings | jina-embeddings-v3 @ 768-dim via Jina API (local nomic-embed-text optional) |
| Reranker | jina-reranker-v3 via Jina API (local bge-reranker-v2-m3 optional) |
| Doc parsing | unstructured.io → Markdown chunks |

## Project layout

```
docker-compose.yml            # PostgreSQL + Qdrant (dev)
backend/
  requirements.txt
  .env.example                # copy to .env
  app/
    main.py                   # FastAPI entrypoint (CORS, session, routers, lifespan)
    core/config.py            # pydantic-settings
    db/session.py             # SQLAlchemy engine / session / Base
    api/routes/
      health.py               # liveness + readiness probes
      chat.py                 # POST /chat + GET /chat/stream (SSE)
      cards.py                # card catalog + user ownership
    models/                   # User, CreditCard, UserCardMapping
    auth/                     # Google OAuth router, JWT utils, get_current_user
    ingestion/ingest.py       # unstructured.io -> Markdown chunks -> Qdrant CLI
    agent/graph.py            # LangGraph: extract -> retrieve -> rerank -> math -> generate
    services/                 # Ollama client, Qdrant helpers, bge reranker
frontend/                     # Next.js 14 App Router PWA
  app/page.tsx                # landing + Google sign-in
  app/auth/callback/page.tsx  # stores JWT from #token fragment
  app/dashboard/page.tsx      # cards, streaming chat, reward comparison
  lib/api.ts                  # JWT fetch helpers + SSE stream parser
```

## Getting started

All infrastructure is cloud-hosted — no Docker required:

| Service | Provider | .env keys |
|---|---|---|
| PostgreSQL | [Neon](https://neon.tech) free tier | `DATABASE_URL` |
| Qdrant | [Qdrant Cloud](https://cloud.qdrant.io) free tier | `QDRANT_URL`, `QDRANT_API_KEY` |
| LLM | Ollama cloud or HF Inference (Qwen3) | `LLM_PROVIDER`, `OLLAMA_API_KEY` / `HF_TOKEN` |
| Embeddings + reranker | [Jina AI](https://jina.ai) free tier | `JINA_API_KEY` |

(`docker-compose.yml` remains for optional local PostgreSQL/Qdrant.)

```bash
# 1. Configure backend/.env with the keys above

# 2. Backend
cd backend
.venv\Scripts\activate                  # venv already created
pip install -r requirements.txt         # full deps incl. sentence-transformers, unstructured
copy .env.example .env                  # fill in OLLAMA_API_KEY, GOOGLE_CLIENT_ID/SECRET
uvicorn app.main:app --reload --port 8000

# 3. Frontend
cd frontend
copy .env.local.example .env.local
npm install
npm run dev                             # http://localhost:3000
```

Verify:
- `GET http://localhost:8000/api/v1/health` → liveness
- `GET http://localhost:8000/api/v1/health/ready` → checks PostgreSQL + Qdrant Cloud connectivity
- Qdrant dashboard: your cluster's dashboard on https://cloud.qdrant.io
- API docs: http://localhost:8000/docs

### Docker-less local development

No Docker? Point the backend at SQLite and seed it with a dev user + sample cards:

```bash
cd backend
set DATABASE_URL=sqlite:///./dev.db
python -m app.db.seed        # prints a dev JWT for authenticated API calls
uvicorn app.main:app --reload --port 8000
```

The seed script's JWT works in `Authorization: Bearer <token>` against every
authenticated endpoint, bypassing the Google OAuth flow during development.

### Google OAuth setup

Create OAuth 2.0 credentials at https://console.cloud.google.com/apis/credentials with
authorized redirect URI `http://localhost:8000/api/v1/auth/google/callback`, then set
`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in `backend/.env`.

### Ingesting card documents

```bash
cd backend
python -m app.ingestion.ingest --file "docs/hdfc_infinia.pdf" \
    --card-id "<CreditCard UUID>" --bank-name "HDFC" --card-name "Infinia"
```

## Execution phases

1. **Phase 1** — Backend scaffold, requirements, docker-compose (Postgres + Qdrant) ✅
2. **Phase 2** — Google OAuth router + SQLAlchemy schema (User, CreditCard, UserCardMapping) ✅
3. **Phase 3** — Document ingestion: unstructured.io, Markdown-header chunking, push to Qdrant ✅
4. **Phase 4** — LangGraph graph: extract intent → retrieve (payload-filtered) → rerank → deterministic math → generate ✅
5. **Phase 5** — Next.js PWA frontend with Google Auth + analytics dashboard ✅

## Notes

- Dev table creation happens via `create_all` on startup (debug mode); switch to Alembic migrations for production.
- The reranker (bge-reranker-v2-m3, ~2 GB) downloads lazily on the first `/chat` request, not at server startup.
- `GET /chat/stream` emits one SSE event per completed LangGraph node; the frontend consumes it with `fetch` streaming (EventSource can't send the Authorization header).
- PWA icons (`frontend/public/icon-192.png`, `icon-512.png`) referenced by the manifest still need to be added.

## CI/CD

Pushes to `main` touching `backend/**` or `frontend/**` trigger a Cloud Build
pipeline (see `backend/cloudbuild.yaml` / `frontend/cloudbuild.yaml`) that
builds the Docker image, pushes it to Artifact Registry, and deploys it to
Cloud Run. No manual `gcloud run deploy` needed for normal changes.
