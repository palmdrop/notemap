# @notemap/full-stack-tests

The layers, joined. A real `@notemap/client` drives the real daemon binary over a real socket, and
the pool underneath is the SQLite file, the blobs, the mirror and a folder on disk.

Every other suite substitutes one side. `packages/client` is tested against a mock transport,
`apps/daemon` against its Hono app in process, and `tests/integration` drives `createPool` with HTTP
absent entirely. All three can be green while the two halves disagree about a status code, a cursor
or a header — that disagreement is what these tests are for, and they assert nothing a faster suite
could assert instead.

```sh
pnpm test:stack
```

It is deliberately outside `pnpm -r test`: this package has no `test` script, so a routine run skips
it. Run it after a change that crosses the layers — the HTTP surface, the host's wiring, the
client's transport, the config file. CI runs it on every push.

## How it runs

A daemon per test, spawned as `node apps/daemon/dist/main.js --config <temp>` — the way a user
starts one — over temp directories thrown away afterwards. Nothing here imports the daemon, so
`main.ts`, the config file and the host's wiring are under test rather than bypassed. A boot costs
about 110ms.

Readiness is read, not guessed: the daemon prints the address it bound, and the harness waits for
that line. A port that refuses a connection cannot say whether the daemon is still starting or died
on the way up, and the difference is the whole of a good failure message.

Port **4748**, beside the daemon's own 4747, so a run never fights the daemon `pnpm dev` left
running. `NOTEMAP_TEST_PORT` in the root `.env` overrides it; a busy port fails the run and says so
rather than quietly moving. One port and one pool is also why `fileParallelism` is off.

The mirror and delivery runners are configured to poll every 25ms and are never driven by hand:
what the journeys wait for is the daemon doing its own work. Every wait is a bounded poll for
something to **appear** — never for something to be absent, which is a race a slow machine loses.
Where a negative matters, such as a delivery still owed to an unmounted drive, it is asserted behind
a positive fence the daemon has demonstrably passed.

`@notemap/seed` fills a pool where a journey wants a populated one; it speaks `/v1` too, so nothing
here reaches behind the daemon to arrange state.
