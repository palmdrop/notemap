# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

WORKDIR /src

RUN corepack enable && corepack prepare pnpm@11.20.0 --activate

# Manifests first, so a source change does not reinstall the workspace.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/daemon/package.json apps/daemon/
COPY apps/ui/package.json apps/ui/
COPY packages/client/package.json packages/client/
COPY packages/core/package.json packages/core/
COPY packages/adapters/blob-fs/package.json packages/adapters/blob-fs/
COPY packages/adapters/destination-fs/package.json packages/adapters/destination-fs/
COPY packages/adapters/mirror-fs/package.json packages/adapters/mirror-fs/
COPY packages/adapters/schema-ajv/package.json packages/adapters/schema-ajv/
COPY packages/adapters/store-sqlite/package.json packages/adapters/store-sqlite/
COPY tests/full-stack/package.json tests/full-stack/
COPY tests/integration/package.json tests/integration/
COPY tests/seed/package.json tests/seed/

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm build


FROM node:24-alpine

ENV NODE_ENV=production

# `paths.ts` resolves `public/` as a sibling of the directory the bundle sits
# in, so these two must land beside each other exactly as they do in the
# workspace. Nothing else comes over: the bundle holds every workspace package,
# the store is `node:sqlite`, and there is no `node_modules` at runtime.
COPY --from=build /src/apps/daemon/dist /app/dist
COPY --from=build /src/apps/daemon/public /app/public

RUN mkdir -p /var/lib/notemap && chown node:node /var/lib/notemap

USER node

EXPOSE 4747

VOLUME /var/lib/notemap

# Exec form, so node is PID 1 and `SIGTERM` reaches it as itself: the daemon's
# own handler is what gives the runners' leases back.
ENTRYPOINT ["node", "/app/dist/main.js"]
CMD ["--config", "/etc/notemap/config.toml"]
