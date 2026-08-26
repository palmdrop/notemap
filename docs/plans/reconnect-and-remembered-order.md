# A surface that comes back, and an order that is remembered

**Date**: 2026-08-26
**Status**: Todo
**Spec**: `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**:

---

## Goal

A pool that goes away and comes back leaves nothing stale on screen: the surface stops reporting a
failure that is over, and reads the pool again without anyone reloading the page. And the end a
reader starts from survives a reload, per surface, carried in the URL and remembered between
visits.

Sits between PR 5 and PR 6 of [offline-capture-rollout](offline-capture-rollout.md). Neither half
touches the wire or the daemon.

---

## What is actually broken

Diagnosed rather than assumed. `client.reachable` already recovers on its own — a scratch test that
boots online, kills the transport, fails a `loadQueue`, restores the transport and advances the
timers watches the observable flip back inside the backoff. The probe is not the bug.

`ListState` is. `loadMore`'s catch sets `failure` and nothing ever clears it; `fromCache` stays true
because nothing re-reads. The shell reads a surface in `onMount` and nowhere else, so there is no
reconnect path at all, and `loadMore` cannot be one: it continues from the position the last page
handed back and appends to the tail.

The order control has the same shape of gap — the order lives in client state and is written
nowhere, so every reload drops back to the client's default.

---

## Tasks

### Phase 1 — a surface that comes back when the pool does

Depends on nothing. `packages/client` only.

- [ ] Create the branch `agent/reconnect-and-remembered-order`
- [ ] A surface can be started again from its order's first page, rather than only walked forward
      from the position it holds. `loadMore` is the walk and stays the walk
- [ ] The client does this itself, where it already drains the outbox on the pool coming back, so
      every shell gets it rather than each shell remembering to. It runs **after** the drain lands,
      so the page the pool answers already holds what was just sent
- [ ] Three rules, and the third is what keeps it honest:
      - a surface **drawn from the cache** — holding nothing the pool gave it — starts again from
        the first page
      - a surface holding a **failure** but real pages the pool answered has the failure cleared and
        nothing else: a reader who walked five pages does not lose them, and `load more` is theirs
        to press
      - a surface **nobody has asked for** stays cold, and is not read on the strength of a
        reconnect alone
- [ ] The third rule is inferred from what a page already carries — no position, no rows, no end and
      no failure — rather than by adding a field to `ListPage`
- [ ] A page says **which kind** of failure it holds. Only an unreachability is cleared by the pool
      coming back; a refusal is the pool having answered, and it stands until the reader asks again.
      Without the distinction the second rule clears both and loses a refusal that was made before
      the outage
- [ ] Tests: one per rule, that a refusal survives a reconnect where an unreachability does not, that
      a cache-drawn surface's first page replaces rather than extends what was drawn, and that the
      read happens after the drain
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green
- [ ] `git commit`

### Phase 2 — the order a reader chose, remembered

Depends on nothing in phase 1; may be built in either order. `apps/ui` only.

- [ ] The URL carries the order of the surface being read — the domain's own words, `oldest-first`
      and `newest-first`, not the control's `oldest` and `newest`. It is what makes a read
      shareable and what survives a reload
- [ ] `localStorage` holds one per surface, because the queue starts oldest-first and the feed
      newest-first and a single key would have to pick a loser
- [ ] Resolution on entering a surface: the URL parameter, then what was stored, then the client's
      own default. A parameter naming an order that does not exist falls through to the same chain
      rather than failing
- [ ] Choosing an order stores it, replaces the URL rather than pushing it — turning a surface
      around is not a place in history — and turns the surface
- [ ] It lives beside the shell's other remembered things (`scroll-mark.ts`, `theme.svelte.ts`)
      rather than inside a component: two surfaces read it and the bar writes it
- [ ] Tests: the parameter beats what was stored, what was stored beats the default, an unreadable
      parameter falls back, and choosing an order writes both
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck` and `pnpm lint` green
- [ ] `git commit`

### Phase 3 — the specs

Depends on phases 1 and 2.

- [ ] `docs/specs/client.md`: the reconnect read joins **Reachability, and a pool that is not the
      one we cached**, where "a pool that comes back drains the outbox" already stands, and the
      three rules are written where **Surfaces drawn from the cache** describes what a failed read
      leaves behind — which is also where the two kinds of failed read part company
- [ ] `docs/specs/shell.md`: **Draining**, which describes the order control, gains that the choice
      is the reader's to keep — carried in the URL, remembered per surface
- [ ] `docs/plans/offline-capture-rollout.md`: this pull request named in the sequence, between
      PR 5 and PR 6
- [ ] Add the dated `Shipped:` entry to both specs (see Notes)
- [ ] `git commit`

---

## Unknowns

- **Whether a reconnect should read a surface the reader is not looking at.** The client cannot see
  which surface a shell is drawing, so the rules above are a proxy: a surface that was asked for is
  refreshed, one that never was is left alone. Booting offline, opening the queue and reconnecting
  therefore reads the queue and not the feed, which is right; opening both and reconnecting reads
  both, which is one request more than needed. *Fallback*: accept the extra read. Telling the client
  which surface is on screen is a new concept in the port and buys one request.
- **Whether clearing a failure without re-reading is enough for the walked-pages case.** The reader
  is left holding pages that may have moved on, with no mark saying so beyond the surface's own
  cache mark. *Fallback*: it is what pressing `load more` already resolves, and PR 7's cache mark is
  where that condition gets drawn.
- **What shape the failure kind takes on `ListPage`.** A second field beside the sentence, or the
  sentence replaced by something carrying both. The client's errors already draw this line as
  `Unreachable` against `Refused` ([client.md](../specs/client.md#the-outbox)), so the fact exists
  and only its wire into `ListState` is open. *Fallback*: a boolean beside `failure`, since a shell
  needs the sentence rendered and the kind decided, and nothing else.

---

## Out of scope

Both stay in PR 7, [shell-offline-marks](shell-offline-marks.md). Both were argued out on
2026-08-26 and the outcomes are recorded here so that plan starts from them rather than from its
own open questions.

**The pending mark on a row.** The word is **pending**; `unsynced` is on
[CONTEXT.md](../../CONTEXT.md)'s Avoid list for exactly this. It goes in the metadata rail, which
settles that plan's first unknown against the inverted timestamp — but **not** in the idiom
`routed`, `archived` and `revised` use. Those are facts about what became of the item in the pool;
pending is a fact about this client's outbox, and the two are different kinds of claim about
different subjects. It reads as the quieter of the two, so an archived row that has not drained can
carry both without either shouting over the other, and `became`'s one-word rule survives untouched.
This is also what CONTEXT.md's "never a failure and never dressed as one" asks for: the inverted
block is the loudest mark in the rail.

**The bar's count stays.** `N waiting` and the row mark answer different questions — whether
anything at all is outstanding, including for rows nobody is looking at, and whether *this* row is —
so shell.md's "Pending is quiet: one count in the chrome" becomes a sentence about two marks rather
than one. That rewrite is PR 7's, not this plan's.

**A failed read stays in the register; only the unreachable one goes.** The corner belongs to the
outbox: an operation, with an id, that a person dismisses. A failed read has neither, and once the
unreachable case is dropped — [shell.md](../specs/shell.md) says unreachable is stated **once**, in
the chrome — what is left is `bad-position` and a few app bugs, which is a near-empty corner needing
a shape of its own. So the register keeps the one read failure that genuinely needs a person, and
loses the one the chrome already states. What phase 1 changes meanwhile is the failure's lifetime,
not its shape: it goes when the pool returns instead of standing until a reload.

**A seam PR 7 will need.** `targetOf` is not exported from `packages/client`, so a shell cannot map
an item to its undrained operations today. Whether that lands as an exported helper or as a derived
observable of the ids with work outstanding is a client API decision and belongs in that plan.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

`pnpm test:stack` is not part of finishing this. Nothing here crosses the HTTP surface, the host's
wiring or the config file: phase 1 is `packages/client`, phase 2 is `apps/ui`.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
