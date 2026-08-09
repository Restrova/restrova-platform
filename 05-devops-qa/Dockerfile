FROM node:22-bookworm-slim

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY 02-backend/server/package.json ./02-backend/server/package.json
COPY 03-frontend/web/package.json ./03-frontend/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/restaurant.db

RUN mkdir -p /data

EXPOSE 3000
CMD ["pnpm", "start"]
