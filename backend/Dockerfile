FROM python:3.11-slim

WORKDIR /app

# psycopg2-binary needs libpq at runtime; build-essential covers any source builds.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-prod.txt .
RUN pip install --no-cache-dir -r requirements-prod.txt

COPY app ./app

# Cloud Run injects $PORT; default to 8000 for local `docker run`.
# --proxy-headers + --forwarded-allow-ips="*" so uvicorn trusts Cloud Run's
# X-Forwarded-Proto and generates https:// URLs (e.g. the OAuth redirect_uri)
# instead of http:// — Cloud Run terminates TLS at its edge, so the app only
# ever sees plain HTTP internally otherwise. Safe here since Cloud Run's
# ingress is the only thing that can reach the container.
ENV PORT=8000
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips="*"
