# Daemon logging

**Date**: 2026-09-20
**Status**: In progress
**Spec**: `docs/specs/http-v1.md`, `docs/specs/core.md`
**Closed**:

---

## Goal

`docker logs notemap` tells the person running it what the daemon did and what went wrong:
every action core appends, every refusal and failure the daemon or a runner meets, and the
startup facts it prints today — each as one levelled line carrying facts, never a payload or a
secret, at a level and in a format `config.toml` chooses.

---

## Decisions

Settled with the developer on 2026-09-20; the plan is written against them.

- **Core reports actions through a port, after commit.** `PoolPorts` gains an optional observer
  core calls with each action once the transaction that appended it has committed, never before
  and never for one that rolled back. `recordAction` is already the one funnel every state change
  goes through, so one hook covers captures, template firings, deferred deliveries and
  abandonments alike — the last three of which no route handler ever sees. Core does not log;
  what the host makes of an action is the host's.
- **pino, and a text formatter of our own.** No `pino-pretty` (settled 2026-09-20 after the
  spike below): its default layout is one event over several lines, and shaping it into one line
  costs about as much as writing the formatter ourselves — a writable pino writes its JSON into,
  which turns each object into one text line. No `pino.transport` either: a transport is a worker
  thread resolved by file path, and the image has no `node_modules` to resolve it from. Both
  formats are an in-process destination on stdout.
- **A text line is the default, JSON opt-in.** The admin is the user, reading `docker logs` by
  eye. `[log] format = "json"` is for whoever ships lines to Loki or the like.
- **One stream, stdout.** Warnings and errors go to stdout with everything else, so
  `docker logs` and the full-stack harness see one ordering rather than two streams interleaved.
  CLI subcommands (`notemap password set`, `notemap tokens …`) keep writing their answers as they
  do; they are program output, not a log.

## What gets logged, at which level

Facts, never sentences with secrets in them. Never: a payload, a tag's text beyond what an
action's detail already carries, an account's secret, a token, a password, a cookie, a bearer
header, a request body.

- **`error`** — a throw the daemon did not expect: `app.onError` (the 500 path), a runner's loop
  throwing, a failed session sweep, an adapter that threw instead of answering. Carries the stack.
- **`warn`** — a fact the admin should act on: an unknown config key, a plain-HTTP origin, an
  adapter's wiring warning, a sign-in that arrived for a host `daemon.origin` did not name, a
  refused login (already throttled; the count is the point), `work-abandoned`, `delivery-failed`,
  `work-failed`.
- **`info`** — what happened: every other action (kind, subject, agent kind, detail), startup
  facts (pool, address, mirror, assets, accounts, destinations, whether sign-in is required),
  auth events with no action of their own (session opened and ended, sessions ended everywhere,
  token minted and revoked — by name and id, never the secret), a sweep that released something,
  shutdown.
- **`debug`** — every HTTP request (method, path, status, duration, whether by session, token or
  nobody), every `4xx` refusal with its code, a mirror write, a runner drain that resolved
  something, a sweep that released nothing.

Requests are `debug` rather than `info` because the shell polls `/v1/actions` on its own tempo
([ADR 32](../adr/0032-a-shell-learns-what-happened-by-reading-the-log.md)) and the container's
healthcheck asks `/v1/health` — at `info` the log would be mostly that.

## Configuration

A `[log]` table in `config.toml`: `level` (`debug` | `info` | `warn` | `error`, default `info`)
and `format` (`text` | `json`, default `text`). `NOTEMAP_LOG_LEVEL` overrides `level` for a
`docker compose` run that wants `debug` without editing the file, on the model of
`NOTEMAP_CONFIG`.

---

## Tasks

### Phase 1 — Core reports actions

Depends on nothing.

- [x] Create branch `agent/daemon-logging`.
- [x] Extend `core.md` § The action log: an optional observer on the ports hears each action
      after the transaction that appended it commits; a rolled-back transaction reports nothing;
      core never logs. Add the port to `PoolPorts` in the same change.
- [x] Implement: collect what a transaction appends, hand it to the observer after the commit.
      Absent observer costs nothing.
- [x] Tests beside `pool.ts`: an action reaches the observer after commit with the same fields
      the log holds; a transaction that throws reaches it with nothing; a pool without one runs
      as before.
- [x] Verify: `pnpm --filter @notemap/core test`, `pnpm typecheck`.
- [x] `git commit`.

### Phase 2 — The logger and its configuration

Depends on nothing; may run beside phase 1.

- [x] Add `pino` to `apps/daemon`; the `createRequire` banner in `build.ts` (see the resolved
      unknown below). Confirm `node dist/main.js` starts from the bundle.
- [x] `apps/daemon/src/log/`: the root logger from `{ level, format }`. JSON is pino's own line
      on stdout. Text is a writable of ours that pino writes into: one event becomes
      `HH:MM:SS.mmm LEVEL message key=value …`, with `err.stack` on the lines below it; `pid`
      and `hostname` are dropped from both formats, since one container is one process on one
      host. Values are quoted only where they hold whitespace or `=`.
- [x] `[log]` table in `config/load.ts` with defaults and validation; `NOTEMAP_LOG_LEVEL` read
      in `loadConfig` and refused like a bad file value when it names no level. A `[log]` table
      note in `config.example.toml` and `docker/compose/config.toml`.
- [x] Tests beside them: a text line for each level, a nested detail object flattened to
      `key.sub=value`, an error with a stack, a JSON line, a secret-shaped field never appears (a
      `redact` list for `authorization`, `cookie`, `password`, `secret`, `token` as belt and
      braces), config parsing and the env override.
- [x] Verify: `pnpm --filter @notemap/daemon test`, `pnpm build`, `node apps/daemon/dist/main.js
      --config apps/daemon/config.example.toml` prints text lines.
- [x] `git commit`.

### Phase 3 — The daemon speaks through it

Depends on phases 1 and 2.

- [x] `main.ts`: every `console.*` becomes a levelled line with fields (the startup facts,
      config warnings, the plain-HTTP warning, adapter wiring, the session-sweep failure, the
      `EADDRINUSE` exit, shutdown). Keep the `on http://…` address line's text: the full-stack
      harness reads readiness from it.
- [x] Wire the phase-1 observer in `ports.ts`: each action becomes a line at the level the table
      above gives its kind, with `kind`, `subject`, `by`, and the detail spread as fields.
- [x] Runners and sweeper: `onError` takes the logger; a drain that resolved something and a
      sweep's release count at `debug`/`info` as above.
- [x] Request logging middleware over `/v1/*` and `/docs`: method, path, status, duration,
      identity kind, at `debug`; a `4xx` also carries `code` from the refusal body. `app.onError`
      logs at `error` with the stack and the request's method and path.
- [x] Auth events at the levels above — in `createAuth` and `createTokens` rather than the
      handlers, since every sign-in, sign-out, mint and revoke passes through them and the CLI's
      do too; `middleware/origin.ts` and `provision.ts` through the logger as well.
- [x] Tests: the request middleware beside `middleware/`; the action-to-line mapping beside
      `log/`; existing tests that assert on `console` output move to asserting on a captured
      logger.
- [x] Verify: `pnpm typecheck`, `pnpm -r --silent test`, `pnpm lint`. No `console.` left under
      `apps/daemon/src` outside `cli/` and `write-openapi.ts`.
- [x] `git commit`.

### Phase 4 — Docs and the full stack

Depends on phase 3.

- [ ] `http-v1.md`: a **Logging** section under Behavior stating what is logged at which level,
      what is never logged, and the `[log]` table; a Constraints line that the daemon logs and
      core does not.
- [ ] `docs/running.md` § Checking on it: what the lines look like, `NOTEMAP_LOG_LEVEL=debug`,
      `format = "json"`.
- [ ] Full-stack: `session.test.ts` asserts on lines the daemon prints — re-read them against
      the new text; add one test that a capture shows up in the daemon's output as a `captured`
      line, and that a refused login shows up as a `warn`.
- [ ] Verify: `pnpm test:stack`.
- [ ] Tick the todo in `docs/todo.md`, add `Shipped:` entries, `git commit`.

---

## Unknowns

- ~~Does pino bundle cleanly under esbuild?~~ **Resolved 2026-09-20**, in a throwaway spike
  outside the repo: `pino` 10.3 bundles with the daemon's exact `build.ts` options and runs with
  no `node_modules` present, once the bundle carries a `createRequire` banner — pino's CJS
  `require("node:os")` otherwise trips esbuild's "Dynamic require is not supported" shim, which
  the current bundle never hits. So phase 2 adds
  `banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }`
  to `build.ts`. Cost: about 245 KB on a 1.74 MB bundle and ~30 pure-JS transitive packages, no
  native builds. `pino-pretty` bundled and ran too, and was dropped on the layout argument above
  rather than on a bundling one.
- ~~Does the sqlite store's `transaction` expose a clean commit point?~~ **Resolved 2026-09-20**:
  `write-lock.ts` issues `COMMIT` right before `transaction()` resolves and `ROLLBACK` on any
  rejection, so "after `transaction()` resolves" is the commit exactly.
- **Which action kinds are `warn`.** The table above names three. If reading real output says
  another kind belongs there, change the table and the code together.

---

## Out of scope

- A request id header on responses. Timestamps correlate well enough for one person; a header is
  a `/v1` surface change and its own decision.
- Log rotation, files, syslog. Docker owns the stream; a host running the daemon bare redirects
  stdout itself.
- Metrics, tracing, any exporter.
- Logging inside adapters or core beyond the action port. An adapter that has something to say
  says it in its outcome.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The full-stack suite runs in phase 4 because it reads the daemon's stdout; unit tests capture
the logger's stream instead.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
