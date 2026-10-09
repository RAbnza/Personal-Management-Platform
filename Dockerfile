FROM node:24.21.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@12.9.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
# Inert build-time settings only; no credentials or environment files are baked
# into either runtime image. Dynamic routes validate real runtime secrets.
RUN PMP_DEPLOYMENT_ENV=local \
    DATABASE_URL=postgresql://app_domain:build-only@127.0.0.1:5432/build \
    AUTH_DATABASE_URL=postgresql://auth_adapter:build-only@127.0.0.1:5432/build \
    BETTER_AUTH_SECRET=build-only-placeholder-never-used-for-runtime-auth \
    BETTER_AUTH_URL=http://localhost:3000 \
    EMAIL_PROVIDER=mailpit EMAIL_FROM_ADDRESS=build@example.test \
    EMAIL_FROM_NAME=Build MAILPIT_API_URL=http://127.0.0.1:8025 pnpm build

FROM node:24.21.0-bookworm-slim AS web
ENV NODE_ENV=production PMP_DEPLOYMENT_ENV=production HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.next-release/standalone ./
COPY --from=build --chown=node:node /app/.next-release/static ./.next-release/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]

FROM build AS production-dependencies
RUN pnpm prune --prod

FROM node:24.21.0-bookworm-slim AS worker
ENV NODE_ENV=production PMP_DEPLOYMENT_ENV=production
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json /app/tsconfig.json ./
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/scripts/jobs/worker.ts ./scripts/jobs/worker.ts
USER node
CMD ["node_modules/.bin/tsx", "scripts/jobs/worker.ts"]

# Controlled scheduled backup tool, isolated from ordinary web/worker roles.
# PostgreSQL's matching major-version client is part of this operator image.
FROM postgres:17.11-bookworm AS backup
COPY --from=build /usr/local/bin/node /usr/local/bin/node
WORKDIR /app
COPY --from=production-dependencies --chown=postgres:postgres /app/node_modules ./node_modules
COPY --from=build --chown=postgres:postgres /app/package.json ./package.json
COPY --from=build --chown=postgres:postgres /app/src ./src
COPY --from=build --chown=postgres:postgres /app/scripts/backup/daily.ts ./scripts/backup/daily.ts
COPY --from=build --chown=postgres:postgres /app/tsconfig.json ./tsconfig.json
USER postgres
ENTRYPOINT []
CMD ["node_modules/.bin/tsx", "scripts/backup/daily.ts"]
