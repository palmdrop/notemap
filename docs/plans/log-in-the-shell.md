# The action log becomes a surface of the shell

**Date**: 2026-09-02
**Status**: In progress <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/client.md`, `docs/specs/http-v1.md`, `docs/specs/shell.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> `/log` stops being a page the daemon serves from `public/` and becomes a route of the shell,
> drawn from components, reading through `@notemap/client`, and responsive on the shell's own
> tokens and breakpoint rather than on a copy of them. `apps/daemon/public/log.html` and
> `apps/daemon/src/log/` are gone when this closes, and the path a person types does not change.

## The design

**[`docs/design/log.html`](../design/log.html) is what this builds**, with
`docs/design/shots/log-1440.png` and `log-390.png` beside it. Open it directly — `file://` works,
there is nothing to serve. Where this plan's prose and that page disagree, the page wins.

It carries the register with every action kind, the flattened `detail`, the accent rule, and the
empty, filtered and refused states. It is a mockup: no state, no data, and a class there is a
suggestion about structure rather than one to copy.

---

## What this reverses, and what it costs

`docs/specs/shell.md` settled on 2026-08-25 that **`/log` is the daemon's markup, drawn in the
shell's language** — restated inline because the page loads nothing from anywhere but the daemon,
with `apps/daemon/src/log/log.test.ts` holding that copy to `tokens.css`.
`docs/specs/http-v1.md` calls it *"host surface on the same terms as the playground: absent from
the document, referred to by nothing in `/v1`, and removable without changing a promise this spec
makes."* This plan removes it, which that sentence already permits.

**What it buys.** The copied palette and the test guarding it both go. The shell's `@theme`
tokens, its `narrow` breakpoint and its primitives apply directly, which is the whole reason to
move: the page is hand-written DOM in a `<script type="module">` and its responsive behaviour is
wrong in ways that are awkward to fix twice. Two defects found 2026-09-02 while rendering it are
**not fixed in the old page**, because the old page is being deleted — `.when { display: block }`
does not stack a stamp whose children are both inline, and `--rail: 6.5rem` is narrower than the
ten monospace characters of `2026-09-02`.

**What it costs.** A daemon with no `public/ui` build loses `/log` entirely, where today it has it.
That is a checkout, not a deployment: the `Dockerfile` copies `apps/daemon/public` after
`pnpm build`, and `docs/running.md:88` says the app is a static build the daemon serves from its own
origin. Worth stating rather than pretending it is nothing.

**The reversal is recorded, not erased** (phase 4). `AGENTS.md` asks for a new ADR or a superseding
note rather than an edit over the old reasoning.

---

## Tasks

### Phase 1 — the client can read actions

Depends on nothing. `@notemap/client` has **no actions surface at all** today: the page hand-rolls
`fetch("/v1/actions")` and builds its own URLs, which is exactly what a shell surface may not do.

- [x] Create branch `agent/log-in-the-shell`
- [x] An `ActionsApi` on the client, a sibling of `TagsApi` and `RoutingApi` rather than a third
      `Observable<ListState>` beside the feed and the queue. **It is not put in the durable store**:
      the log is a read for diagnosis, not a surface that has to survive an unreachable pool, and
      persisting it would grow what every client writes to disk for no offline gain
- [x] It pages by a **position** in the domain's terms — a capture time and an id, as
      `CONTEXT.md` defines one — not by following the `next` URL the page follows today. `/v1`
      answers `next`; a client that hands its callers a URL has leaked the wire into the surface
- [x] It takes an order and a subject filter, matching what `GET /v1/actions` already answers.
      Naming an order the surface is not in turns it around and starts again, on the same terms as
      `loadFeed`
- [x] `docs/specs/client.md` says what the read is and that it is not durable
- [x] Tests beside it: a page is read; a position continues it; an order change restarts; a subject
      filter narrows; a refusal surfaces through `saidBy` like every other read
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm test:stack` — the
      client's transport is one of the layers that suite is for
- [x] `git commit`

### Phase 2 — the surface

Depends on phase 1. The daemon's `/log` route still shadows this path until phase 3, so this phase
is verified against `pnpm dev`, where the shell is served directly and nothing shadows it.

- [x] `apps/ui/src/routes/log/`, built from [`docs/design/log.html`](../design/log.html): the
      register, the kind as the shell's own `StateWord`, the flattened `detail`, the bar with the
      order control and the count
- [x] **`detail` is flattened generically, never per kind** — dotted keys, strings unquoted, arrays
      joined, nested objects flattened. `ActionKind` has 28 members and will gain more; a renderer
      per kind is that many places to drift from a shape nobody updates, and a kind nobody has
      written yet reads correctly for free
- [x] **Accent is spent on `delivery-failed`, `work-failed` and `work-abandoned`**, and on the
      failure code beside them. Not on `purged`, `destination-deleted` or `actions-cleared`: those
      are facts rather than warnings, and a log where half the rows are red says nothing
- [x] A subject is shortened to its head and tail and links to the log filtered to it. Resolving a
      `routed` row's destination id to a name is **not** done here — it is a second read and a
      cache, and the action recorded an id
- [x] The empty, subject-filtered and refused states all exist, because the page being replaced has
      them and a redesign is where they get quietly dropped
- [x] **Responsiveness is done here properly.** The rail this surface wants is not the register's —
      `--spacing-read` is the precedent for a surface naming its own measure. Below `narrow` the
      stamp stacks (both children, not just the container) and a `detail` pair stacks so the value
      takes the measure
- [x] Tests beside the components, as `src/components` already does: flattening handles nesting,
      arrays and an unknown kind; the accent rule picks exactly three kinds; a stamp stacks below
      the breakpoint
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`; and by eye against
      `docs/design/shots/log-1440.png` and `log-390.png` with `pnpm dev`, per the command
      `docs/design/README.md` carries
- [x] `git commit`

### Phase 3 — the daemon's page goes

Depends on phase 2 being complete and looked at. Until the route is removed the shell's `/log` is
unreachable, so this is the phase that switches it over.

- [ ] The `GET /log` route, `apps/daemon/public/log.html` and `apps/daemon/src/log/` are deleted.
      `serveUi` then answers `/log` with the shell, because an unmatched extensionless path already
      falls through to it — no redirect, and the exits `docs/specs/shell.md` describes keep working
- [ ] `apps/daemon/src/log/log.test.ts` asserted the page stays served with the door shut, *because
      it is the application and not the pool*. That property still holds and now belongs to the
      shell. Check whether `apps/daemon/src/ui/serve.test.ts` covers it already; add it there if it
      does not, rather than losing it with the file
- [ ] `docs/specs/http-v1.md` loses the `GET /log` section. `GET /v1/actions` is unchanged, and was
      always the promise
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm test:stack` — a route
      the daemon answered is gone, which is the HTTP surface changing
- [ ] Verify by hand: a built daemon serves the shell at `/log`, with the door shut and with it open
- [ ] `git commit`

### Phase 4 — the reversal is recorded

Depends on every phase above.

- [ ] **An ADR.** Why the log moved from host surface to shell surface: what the copied palette and
      its guarding test cost, what a checkout with no UI build loses, and why `/v1/actions` being
      the only promise is what made this cheap. `AGENTS.md` asks for a new ADR or a superseding note
      rather than an edit over the old reasoning, and the 2026-08-25 decision had reasoning worth
      keeping
- [ ] `docs/specs/shell.md` — the 2026-08-25 entry gets a superseding note rather than a rewrite;
      the answered question dated 2026-08-19 says what the answer became; and the line under *what
      this shell does not draw* that reads "`/log` is no longer in this list: it is the daemon's
      markup still" is now wrong twice over
- [ ] `docs/design/README.md` and the prose in `docs/design/log.html` both describe corrections to a
      daemon page that no longer exists. Say what the file is now
- [ ] Verify: the specs and the code agree; no doc still calls `/log` the daemon's markup
- [ ] `git commit`

---

## Unknowns

- **Whether the action log wants to be in the durable store after all.** Phase 1 says no on the
  argument that it is diagnosis rather than a surface to drain. If reading the log offline turns out
  to matter, adding it later is additive and costs nothing that this shape forecloses.
- **Whether `serve.test.ts` already covers the door-shut property** `log.test.ts` asserted. Phase 3
  checks rather than assumes. Fallback: the assertions move file and nothing is lost.
- **Whether the shell wants its own rail token or should reuse `--spacing-rail`.** The log's rail
  holds a stamp and one short word, and the register's holds a great deal more. Fallback: reuse the
  shared token and accept a wider column than the content needs, which is what the old page did.
- **Whether anything outside the app links to `/log` expecting the daemon's markup.** A bookmark
  keeps working; a script that scraped it does not. Nothing in this repo does, and nothing promises
  it.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Flattening `detail`, choosing the accent and shortening an id are pure and unit-testable without a
pool, and that is where most of this plan's evidence lives — tests beside the components, as
`src/components` already does. `pnpm test:stack` is required for phases 1 and 3, which change the
client's transport and remove a route the daemon answered; phases 2 and 4 do not cross a layer.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
