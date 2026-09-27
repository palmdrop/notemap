# Relay fixes: structured logs, and a tag foot read as tags

**Date**: 2026-09-27
**Status**: In progress
**Spec**:
**Closed**:

---

## Goal

A relay's output is the daemon's output — `HH:MM:SS.mmm LEVEL message key=value`, levelled,
with a `[log]` table and a JSON format — and a relay told `hashtags = true` reads the `#tag`
line at the foot of an upstream note as the note's tags, takes that line off the prose, and
captures both.

---

## Decisions

Settled with the developer on 2026-09-27.

- **The logger is extracted, not copied.** `apps/daemon/src/log/{create,config,text,testing}.ts`
  becomes `packages/plumbing/log` as `@notemap/log`; the daemon keeps `actions.ts`, which needs
  core, and imports the rest. One format across every program in the repo, one formatter to
  maintain. `LOG_LEVEL_VARIABLE` stays per app — the daemon's is `NOTEMAP_LOG_LEVEL` and a relay's
  names the relay — because the validation is shared and the variable's name is not.
- **The tag foot, not every hashtag.** A `#tag` mid-sentence is words somebody wrote and stays
  words. A trailing line made of nothing but hashtags is classification, and comes off the prose.
  This is how people actually write, and it keeps `#include`, `#ff0000` and `#1` out of the tag
  set without the parser knowing what a code fence is.
- **The prose loses the foot.** Otherwise a markdown destination with `hashtags = true` writes the
  same tags twice, once in the body and once in the foot it adds itself.
- **Read by each mapping, not by the relay.** `packages/relay` exports the rule as a pure
  function; each app's `relayedFrom` applies it. `Relayed.tags` stays honest — what is in it is
  what gets captured — and the mapping layer is already where what an upstream *means* is decided.
- **One flag per relay, off by default.** Departing from the sketch in one respect: the key goes
  under the **upstream's** table — `[memos] hashtags` and `[arena] hashtags` — not under `[pool]`.
  It is about how the relay reads somebody else's prose; the pool never sees the difference.

### The rule, precisely

- A **tag line** is a line that, trimmed, is non-empty and made only of whitespace-separated
  tokens matching `#` followed by a letter or digit and then any of letters, digits, `/`, `-`, `_`.
- The **foot** is every tag line at the end of the text, taken together. `#kind/quote` and
  `#topic/x` on two lines are one foot.
- The tags are those names in reading order, duplicates dropped, merged after whatever tags the
  relay was configured with.
- The prose is what stands above, with trailing blank lines trimmed.
- **Where nothing but whitespace stands above the foot, nothing is taken off.** A note that is
  only tags would otherwise capture as empty, which a relay refuses — so its tags are read and its
  text stands as written.
- A token that does not match — `#kind/quote.`, `#a b` — makes the line prose, and the whole foot
  with it. Predictable beats clever.
- A `route/` tag in a foot fires a routing template, exactly as a configured tag does
  ([core.md](../specs/core.md) — a source-supplied tag fires too). Worth knowing before writing
  one in an are.na block.

### What turning it on costs

The payload's text changes for every upstream note carrying a foot, so the poll after the flag is
set captures a changed payload under an identity the pool holds: each affected item is **amended
or revised once**, and is then stable. Off by default for that reason.

---

## Tasks

### Phase 1 — `@notemap/log`

Depends on nothing. Nothing observable changes; the daemon prints what it printed.

- [x] Create branch `agent/relay-fixes`. _(2026-09-27)_
- [x] `packages/plumbing/log` as `@notemap/log`: `create.ts`, `config.ts`, `text.ts` and their
      tests moved verbatim, `testing.ts` under a `./testing` export so a test helper is not in the
      package's own surface. `pino` moves with them.
- [x] Daemon: every caller imports `@notemap/log` and the pass-through barrel goes; `actions.ts`
      stays, and `LOG_LEVEL_VARIABLE` moves beside its only caller in `config/load.ts`.
- [x] Verify: `pnpm typecheck`, `pnpm -r --silent test`, `pnpm lint`, `pnpm --filter
      @notemap/daemon build`, and `node apps/daemon/dist/main.js --config
      apps/daemon/config.example.toml` still prints text lines.
- [x] `git commit`. _(2026-09-27)_

### Phase 2 — The relays speak through it

Depends on phase 1.

- [x] Both relay apps: `@notemap/log` as a dependency, the `createRequire` banner in
      `scripts/build.ts` — pino is CommonJS and an ESM bundle has no `require` without it.
- [x] A `[log]` table in each config schema, `level` and `format` with the shared defaults, and
      `NOTEMAP_RELAY_MEMOS_LOG_LEVEL` / `NOTEMAP_RELAY_ARENA_LOG_LEVEL` read in `loadConfig` and
      refused like a bad file value.
- [x] `main.ts` and `run.ts`: the `Log` port and `said()` go; `relayEverything` takes the logger
      and says facts as fields. `reasonOf` in `@notemap/log` replaces the `message()` helper each
      main had a copy of: a `warn` about one item carries the cause chain as `because=`, a one-line
      fact, and a stack belongs to `err` at `error`. `info` for the startup facts and each poll's tally; `warn` for an
      item that could not be relayed and a channel that could not be read; `error` for a poll that
      could not be finished and for the throw that exits non-zero; `debug` for each item's
      landing. `--help` and the usage text stay program output, as the daemon's CLI does.
- [x] Tests: `run.test.ts` in both apps reads `capturedLog()` instead of its `Log` fake; a line
      per level asserted where the fake's `faults` were.
- [x] Update the full-stack assertions that read the tally as prose (`/captured 0, unchanged 2/`)
      and the one that reads a failure line.
- [x] Verify: `pnpm typecheck`, `pnpm -r --silent test`, `pnpm lint`, both relays `build`, each
      `--help` and each `--once` against nothing runs from its bundle; `pnpm test:stack`.
- [x] `git commit`. _(2026-09-27)_

### Phase 3 — A tag foot becomes tags

Depends on nothing; may run beside phases 1 and 2.

- [x] `packages/relay/src/tags.ts`: the foot rule as a pure reader, and the merge both mappings
      use. Exported from the package index.
- [x] Tests beside it: a one-line foot, a two-line foot, a mid-sentence hashtag left alone, a
      token that disqualifies its line, a text that is only a foot, trailing blank lines, a
      duplicate across the configured tags and the foot, no text at all.
- [x] `hashtags` in both config schemas under the upstream's table, default `false`, and through
      to `relayedFrom` — memos' `relayEverything` gains a `Scan` of its own rather than a bare
      boolean argument, which is the shape arena's already had — for arena, before the version digest, so the digest is over the payload's
      prose and a foot edited upstream alone is `already-captured`.
- [x] Tests beside both `relayed.test.ts`: on and off, and for memos that a foot's tags merge with
      the ones Memos extracted itself rather than replacing them.
- [x] Verify: `pnpm typecheck`, `pnpm -r --silent test`, `pnpm lint`.
- [x] `git commit`. _(2026-09-27)_

### Phase 4 — Docs and the full stack

Depends on phases 2 and 3.

- [ ] `config.example.toml` in both relays: the `[log]` table and the `hashtags` key, each with
      what it costs. `docker/compose/relay-*.toml` the same.
- [ ] Both READMEs: what the relay says, now that it says it with a clock and a level; the
      mapping table's `content` row, and the amend-or-revise cost of turning `hashtags` on.
      `relay-memos`' table also gains that a foot's tags merge with Memos' own.
- [ ] `CONTEXT.md` § Relay: a clause that a relay logs as the daemon does, and that a tag foot is
      read where it is asked for. No new term.
- [ ] Full-stack: one test per relay that a note with a tag foot arrives with those tags and
      without that line, and that it does not with the flag off.
- [ ] Verify: `pnpm test:stack`.
- [ ] Tick the todo in `docs/todo.md` if one covers this; `git commit`.

---

## Unknowns

- **Does pino bundle under the relays' `build.ts`?** It does under the daemon's, with the same
  esbuild options and the `createRequire` banner ([daemon-logging](daemon-logging.md)), so this is
  near-certain. Fallback if a relay bundle trips anyway: the same banner plus `external: ["pino"]`
  and a `node_modules` in the image, which the Dockerfiles would have to gain — expensive enough
  to be worth knowing early, so phase 2 builds and runs the bundle before anything else.
- **~250 KB per relay bundle.** The daemon paid it on a 1.74 MB bundle; a relay's is smaller, so
  the proportion is worse and the absolute number is the same. Accepted unless the developer says
  otherwise.
- **No spec covers a relay**, deliberately — a relay is outside notemap
  ([ADR 39](../adr/0039-a-relay-is-outside-notemap-and-reaches-v1-like-anything-else.md)) and its
  documentation is its README. So this plan lists no **Spec** and owes no `Shipped:` entry; the
  READMEs and `CONTEXT.md` are what phase 4 updates instead. Say so if a `docs/specs/relay.md`
  should exist — it is a larger decision than this plan.

---

## Out of scope

- Logging inside `packages/relay`. An upload and a capture are the app's to report; handing the
  shared half a logger is a wider change than either fix.
- Reconciling tags after capture. Classification travels once, at capture, and nothing here
  changes that — a foot edited upstream does not re-tag the item.
- Reading a hashtag anywhere but the foot, and reading one out of a code fence.
- The raycast extension and the shell, which capture prose a person is looking at and have their
  own tag chooser.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The foot rule is a pure function and is tested as one; the two mappings are tested for the wiring
and the flag, not for the rule again. The full-stack suite runs in phases 2 and 4 because both
touch what a relay prints and what the pool ends up holding.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
