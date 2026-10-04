FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY 02-backend/server/package.json ./02-backend/server/package.json
COPY 03-frontend/web/package.json ./03-frontend/web/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY 02-backend/server/package.json ./02-backend/server/package.json
COPY 03-frontend/web/package.json ./03-frontend/web/package.json
RUN pnpm install --prod --filter server --frozen-lockfile
COPY 02-backend/server/src ./02-backend/server/src
COPY 02-backend/server/db ./02-backend/server/db
COPY 02-backend/server/scripts ./02-backend/server/scripts
COPY --from=build /app/03-frontend/web/dist ./03-frontend/web/dist
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/restaurant.db
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "02-backend/server/src/index.js"]
