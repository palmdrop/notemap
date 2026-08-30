# syntax=docker/dockerfile:1

FROM node:24-alpine AS build

WORKDIR /src

RUN corepack enable

# The lockfile is what populates the store, so a workspace package added later
# needs nothing remembered here. The root manifest comes with it only so that
# corepack reads the pnpm version from `packageManager` rather than from a
# number written here as well.
COPY pnpm-lock.yaml package.json ./
RUN pnpm fetch

COPY . .

RUN pnpm install --offline --frozen-lockfile

RUN pnpm build


FROM node:24-alpine

ENV NODE_ENV=production

# `paths.ts` resolves `public/` as a sibling of the directory the bundle sits
# in, so these two must land beside each other exactly as they do in the
# workspace. Nothing else comes over: the bundle holds every workspace package,
# the store is `node:sqlite`, and there is no `node_modules` at runtime.
COPY --from=build /src/apps/daemon/dist /app/dist
COPY --from=build /src/apps/daemon/public /app/public

# `vaults/` is where the compose files mount a filesystem destination's
# `root`. The container reaches nothing else, because nothing else is
# mounted — and a root pointed at `state/`, `pool-mirror/` or `assets/`
# instead is refused regardless of where it is mounted.
RUN mkdir -p /var/lib/notemap/vaults && chown -R node:node /var/lib/notemap

USER node

EXPOSE 4747

VOLUME /var/lib/notemap

# Exec form, so node is PID 1 and `SIGTERM` reaches it as itself: the daemon's
# own handler is what gives the runners' leases back.
ENTRYPOINT ["node", "/app/dist/main.js"]
CMD ["--config", "/etc/notemap/config.toml"]
