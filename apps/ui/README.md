# @notemap/ui

The web shell. A SvelteKit app that draws `@notemap/client` and holds no state
logic of its own — capture, the feed, the queue and an item's processing
actions. See [client.md](../../docs/specs/client.md) for what a shell is and
what it owes the client.

Static build, no server. The daemon serves it from its own origin in
production; `vite dev` proxies `/v1` to the daemon in development, so both are
same-origin and `/v1` needs no CORS header.

```sh
pnpm --filter @notemap/daemon start   # the pool, on NOTEMAP_PORT
pnpm --filter @notemap/ui dev         # this, proxying to it

pnpm --filter @notemap/ui check       # svelte-check
pnpm build                            # a daemon that serves this app at /
```
