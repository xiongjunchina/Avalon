ARG NODE_IMAGE=node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43
ARG CADDY_IMAGE=caddy:2-alpine@sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/game-core/package.json ./packages/game-core/package.json
RUN npm ci --no-audit --no-fund
COPY tsconfig*.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts/build-server.mjs scripts/migrate.ts ./scripts/
RUN npm run build && npm run build:server

FROM ${NODE_IMAGE} AS server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json ./apps/server/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/game-core/package.json ./packages/game-core/package.json
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY --from=build --chown=node:node /app/dist/server/ ./
USER node
EXPOSE 3001
CMD ["node", "apps/server/src/index.js"]

FROM ${CADDY_IMAGE} AS gateway
COPY --from=build /app/apps/web/dist /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
