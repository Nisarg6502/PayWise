# NEXT_PUBLIC_API_URL is a build-time env var — baked into the client bundle by
# `next build`, so it must be set before the build step, not as a Cloud Run
# runtime env var. `gcloud run deploy --source` (Dockerfile mode) doesn't
# thread --set-build-env-vars through as a docker --build-arg (that flag is
# for Buildpacks builds only), so it's hardcoded here instead. Update this if
# the backend Cloud Run URL ever changes.
FROM node:20-slim AS builder
WORKDIR /app
ENV NEXT_PUBLIC_API_URL=https://paywise-backend-177155403272.us-central1.run.app/api/v1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.mjs ./next.config.mjs

# Cloud Run injects $PORT; default to 3000 for local `docker run`.
ENV PORT=3000
CMD exec npm run start -- -p ${PORT}
