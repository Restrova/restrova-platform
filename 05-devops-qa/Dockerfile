FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json ./
COPY 02-backend/server/package.json ./02-backend/server/package.json
COPY 03-frontend/web/package.json ./03-frontend/web/package.json
RUN npm install

COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/restaurant.db

RUN mkdir -p /data

EXPOSE 3000
CMD ["npm", "start"]
