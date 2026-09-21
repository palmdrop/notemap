# Review: Daemon logging

**Date**: 2026-09-21
**Status**: Open
**Scope**: `git diff main...HEAD` (PR #70, branch `agent/daemon-logging`)
**Plan**: `docs/plans/daemon-logging.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`

---

## Overall

Matches the plan closely and the pieces I checked against it — the commit point in
`write-lock.ts`, the observer wiring, every log call site, the request middleware's body
handling — hold up. Typecheck, `pnpm -r --silent test` and `pnpm lint` are all clean. Both specs
carry a dated `Shipped:` entry for this plan (Done), so the trail is intact.

Two real findings. The bigger one: an observer that throws takes the whole daemon down via an
unhandled `uncaughtException`, with no graceful shutdown, for what is meant to be a pure
side-channel. The other: the redact list only reaches one level of nesting, so the "belt and
braces" guarantee the spec states without qualification does not hold at two levels deep — no
current call site trips it, but nothing stops one from doing so later, and the text formatter's
own `flatten()` was written expecting nested detail objects.

---

## Bugs

### 1. The redact list only catches one level of nesting

`apps/daemon/src/log/create.ts:25` — `REDACTED.flatMap((key) => [key, \`*.${key}\`])` builds pino
redact paths that match a secret-shaped key at the root or exactly one level down. Verified
directly against the installed pino:

```
$ node --input-type=module -e "
import pino from 'pino';
const logger = pino({redact:{paths:['password'].flatMap(k=>[k, \`*.\${k}\`]), censor:'[redacted]'}});
logger.info({account:{nested:{password:'hunter2'}}}, 'leak');
"
{"level":30,...,"account":{"nested":{"password":"hunter2"}},"msg":"leak"}
```

`account.nested.password` — two levels down — comes through in plain text, in both JSON and
(via `text.ts`'s `asText`, which just reparses the same JSON) the text format. `create.test.ts`
only exercises one level (`account.password`), so this passed review by the tests that exist.

`docs/specs/http-v1.md`'s Logging section states, unqualified, "a field named like one is
printed redacted." `log/text.ts:30`'s `flatten()` is written to walk arbitrarily deep nesting
(`key.sub=value`), which is the tell that nested `detail` objects were anticipated — the redact
list wasn't built to match.

No call site today nests a secret-shaped key two levels in, so nothing leaks right now. But the
guarantee as documented is false past one level, and it's the exact belt-and-braces mechanism
the plan and spec point to as the backstop against a future mistake.

Fix: either a deep/recursive redaction pass in the formatter (walk every level, not just pino's
one-level wildcard), or list every depth pino's redact actually needs to cover for the shapes
`detail` can take, and say in the comment what depth is covered and why that's enough.

---

## Design

### 2. An observer that throws crashes the whole daemon, not just the write

`packages/core/src/pool/observe.ts:33` — when `observer.action()` throws, the rethrow happens
inside `queueMicrotask`, which lands as a Node `uncaughtException`. `main.ts` registers no
`uncaughtException` handler, so Node's default kicks in: print and `process.exit(1)`. That skips
`close()` entirely — the mirror runner, delivery runner, sweeper and pool never get a chance to
stop, and every other in-flight request is cut off along with the one that happened to trigger
the log line.

The port's own doc comment (`packages/core/src/types/api/ports.ts:83`) is explicit that this is
deliberate: "a throw here cannot be reported as that change failing; it surfaces as an uncaught
exception instead." That's a considered choice, not an oversight, but the blast radius is out of
proportion to what this subsystem is for. `logAction` (`apps/daemon/src/log/actions.ts`) spreads
`detail` — a `JsonObject` — into a pino call; pino's serializer doesn't throw on ordinary JSON
shapes, but the port makes no promise about what a future observer might do (a custom collector,
a metrics hook, anything else hung off `ActionObserver` later), and "a bug in the thing that
prints what happened" ending the process is a strange failure mode for a feature whose entire
job is visibility, not correctness. A bad write is exactly the case this project already treats
as "answer, don't crash" everywhere else (`app.onError` catches the request path and answers
500; a failed sweep is `log.error` and carries on; `provisionCredential`'s own password check
answers rather than throwing past its caller).

Given the write is already durably committed by the time this runs, an alternative that doesn't
change the "core has committed and moves on regardless" property: catch here and write the
failure directly to `process.stderr` (bypassing the logger, since the logger is what just
misbehaved) rather than becoming an uncaught exception with no handler anywhere in `main.ts`. If
a loud, process-ending failure is still wanted, register an explicit
`process.on('uncaughtException', ...)` in `main.ts` that at least runs `close()` first — the
current shape gets loudness by accident, not by a top-level handler that was designed to give
it a clean exit.

Worth raising before shipping, not necessarily before merging as-is if you want to accept the
tradeoff explicitly. Flagging per the review brief's request for scrutiny on this exact path.

### 3. "The log" now names two different things across the two specs

`docs/specs/http-v1.md`'s new § Logging uses "the log" bare to mean the daemon's stdout output
("at `info` the log would be mostly that"), while `CONTEXT.md`'s existing **History** entry
already claims "the log" bare for the action log ("the log itself is still the log, and one
entry is still an action"). Each section is locally consistent — http-v1.md always says "the
action log" explicitly when it means core's structure — but `CONTEXT.md` wasn't touched by this
change, so the glossary has no entry for the new concept and the bare word now has two referents
depending on which document you're standing in. Minor as long as both docs stay internally
careful about it, per AGENTS.md's instruction to fix a term in `CONTEXT.md` rather than let a
synonym (or an overload) drift in unrecorded.

---

## Minor

### 4. `app.onError` and the request-log middleware both log a 500, at two levels

`apps/daemon/src/app.ts:281` logs `error` with the stack; `apps/daemon/src/middleware/request-log.ts:20`
separately logs `debug` for the same request (status 500, no `code` since `refusalCode` only
reads 4xx bodies). Two lines for one failure. This matches the spec's stated split (`error` for
the throw, `debug` for "every request") rather than double-counting anything meaningful, so I'm
not calling it a bug — just noting it so a future "why are there two lines for one 500" question
has an answer on record.

---

## Non-issues

- **`response.clone().json()` in `request-log.ts:42`** — reads the outgoing 4xx body to pull
  `code`. Confirmed by `request-log.test.ts`'s "leaves the response readable" case that the
  original response is still consumable after. Bodies here are the small JSON refusal grammar,
  not a stream of any size, so the extra parse is negligible.
- **Spreading `tx` and `store` in `observe.ts`** — both are plain object literals built fresh per
  call (`poolTx()` in `pool-store.ts:844`, `poolTx` methods are closures, not `this`-bound), so
  spreading and overriding `appendAction` is safe.
- **The commit-point claim** — verified against `write-lock.ts:79`: `COMMIT` runs synchronously
  before `execute()`'s returned promise resolves, and `pool-store.ts:1139` wires `transaction` to
  exactly that path, so "after `store.transaction()` resolves" is the commit, not an
  approximation.
- **Default-silent loggers** (`createAuth`, `createTokens`, the two runners, the sweeper,
  `provisionCredential`) — all default to `silentLogger()` for testability, but `main.ts` passes
  the real logger to every one of them (`openAuth`, `startMirrorRunner`, `startDeliveryRunner`,
  `startSweeper`, `provisionCredential` are all called with `log`). No silent default reaches
  production wiring.
- **No secret reaches a log call** — checked every `log.*` call site under `apps/daemon/src`:
  session/token lines carry `id`/`name`, never `minted.token` or `minted.secretHash`
  (`auth/sessions/index.ts`, `auth/tokens/index.ts`); `noticeOrigin` logs only the `Host` header;
  action `detail` objects built in `packages/core/src/pool/**` (checked `capture.ts`,
  `archive.ts`, `edit.ts`, `tags.ts`, `work.ts`, `routing/route.ts`, `routing/delivery.ts`,
  `templates/fire.ts`, `templates/lifecycle.ts`, `destinations/lifecycle.ts`) carry ids, kinds
  and names, never a payload or a destination's credential.
- **The one remaining `console.error` in `main.ts:227`** — the outermost `entry().catch(...)`,
  unchanged by this diff. It runs before `createLogger` exists for a `start()` failure, and is
  the CLI's own failure path for `runCliCommand` — both cases the plan's "no console.* outside
  cli/" checklist item doesn't really mean to catch. Pre-existing, out of scope.
- **The `createRequire` banner in `build.ts`** — differs slightly from the plan's exact text
  (aliased to `__createRequire` before assigning `require`) but same effect; the plan documents
  the outcome of the spike, not a literal snippet to match.

---

## Resolution

Not yet addressed.
