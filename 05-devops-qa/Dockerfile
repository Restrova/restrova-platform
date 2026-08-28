# ---------- Build stage ----------
FROM node:22-bookworm-slim AS build

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY 02-backend/server/package.json ./02-backend/server/package.json
COPY 03-frontend/web/package.json ./03-frontend/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ---------- Production stage ----------
FROM node:22-bookworm-slim AS production

WORKDIR /app

RUN corepack enable

# Production dependencies only (no devDependencies, no test tooling).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY 02-backend/server/package.json ./02-backend/server/package.json
COPY 03-frontend/web/package.json ./03-frontend/web/package.json
RUN pnpm install --prod --frozen-lockfile

# Runtime code and the built frontend only (no test suites, no dev databases).
COPY --from=build /app/02-backend/server/src ./02-backend/server/src
COPY --from=build /app/02-backend/server/db ./02-backend/server/db
COPY --from=build /app/03-frontend/web/dist ./03-frontend/web/dist

ENV NODE_ENV=production
ENV PORT=3000
# Durable storage: mount a volume at /data. The backend refuses to start in
# production when DATABASE_PATH points at a temporary directory such as /tmp.
ENV DATABASE_PATH=/data/restaurant.db

RUN mkdir -p /data && chown -R node:node /data /app
USER node

VOLUME /data

EXPOSE 3000
CMD ["pnpm", "start"]
