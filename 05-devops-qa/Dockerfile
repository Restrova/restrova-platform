FROM node:22-trixie-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY 02-backend/server/package.json ./02-backend/server/package.json
COPY 03-frontend/web/package.json ./03-frontend/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-trixie-slim AS production-deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY 02-backend/server/package.json ./02-backend/server/package.json
COPY 03-frontend/web/package.json ./03-frontend/web/package.json
RUN pnpm install --prod --filter server --frozen-lockfile
RUN mkdir -p /data && chown 65532:65532 /data

FROM gcr.io/distroless/nodejs22-debian13:nonroot AS runtime
WORKDIR /app
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=production-deps /app/02-backend/server/node_modules ./02-backend/server/node_modules
COPY --chmod=0555 02-backend/server/package.json ./02-backend/server/package.json
COPY --chmod=0555 02-backend/server/src ./02-backend/server/src
COPY --chmod=0555 02-backend/server/db ./02-backend/server/db
COPY --chmod=0555 02-backend/server/scripts ./02-backend/server/scripts
COPY --from=build /app/03-frontend/web/dist ./03-frontend/web/dist
COPY --from=production-deps --chown=65532:65532 /data /data
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/restaurant.db
ENV DATABASE_VOLUME_PATH=/data
USER 65532:65532
EXPOSE 3000
CMD ["02-backend/server/src/index.js"]
