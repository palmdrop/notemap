# The shell says what happened

**Date**: 2026-09-03
**Status**: In progress <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> Something happening to your work is said where you are looking, once, in the corner the shell
> already speaks from. Routing an item says where it went — or that it has not gone yet. A delivery
> that fails ten minutes later says so without anybody opening `/log`, and a delivery that is given
> up on says the item is back in the queue, which is where it will be.

---

## What it costs today

Verified 2026-09-03.

Routing succeeds, `RoutingComposer.svelte:104` closes the modal, and the row leaves the queue. That
is the whole of the feedback: an item vanishing is both the confirmation and, when a deferred
delivery is later abandoned, the thing that quietly reverses — `work.ts:220` removes the reservation
on giving up, which returns the item to the queue with nothing said. The two look identical, a beat
apart.

A failure is drawn at the control that caused it, where the control is still on screen:
`QueueRow.svelte:134` renders a `said` string, and the composer keeps its modal open on a refusal.
That is right and this plan keeps it. What has nowhere to go is a failure whose control has gone —
and everything after a delivery is deferred is one of those.

The corner exists already. `Refusals.svelte` fills `Alarm.svelte` — a fixed stack, bottom-left —
with refused outbox operations, and shell.md's **Reachable, pending, refused** section spends the
corner deliberately: the left one because the right holds a composer, and the loud one because a
refusal will not resolve without a person. Nothing else is allowed to speak there yet.

## What the pool already answers

Established while planning; none of this needs core to change.

- **`routed` is written when a delivery actually lands**, not when the decision is made — the inline
  path at `routing/route.ts:229` and the deferred one at `work.ts:178`, both carrying the record,
  the destination, the capability and the pointer. So the log already holds the confirmation, and no
  new `ActionKind` is owed.
- **`delivery-failed` is written per attempt** (`work.ts:228`), **`work-abandoned` at the end of the
  road** (`work.ts:253`), and `$lib/actions.ts` already names those three as the kinds the accent is
  spent on. The set the shell would raise is a set it has.
- **`ActionsApi.read` takes an order and a position** and answers newest-first, so catching up on
  what happened since a mark is one call.
- **`route()` answers the record**, whose `state` is `pending` or `delivered`. So the immediate word
  can be honest about which of the two happened without asking anything further.

The one thing that does not work as it looks: **the reachability probe cannot carry the poll**.
`pool/reachability.ts` pushes the probe out on every answered request, so a client whose requests
are being answered never sends one — the tick goes quiet exactly when a person is working. The
watcher needs its own timer, sharing only the `watched` gate.

## Decisions taken

Settled with the developer 2026-09-03.

- **One place, with gradations.** A notice joins the existing bottom-left stack above the refusals
  rather than taking a second corner. The shell speaks from one place and the treatment says how
  much it means; a second place would mean a reader learning two corners to learn nothing more.
- **A confirmation fades and a failure stays.** Anything a person may have to act on holds until
  dismissed, which is the rule the corner already follows. A success is a glance.
- **A gesture speaks when its subject leaves the screen.** Route, mark done and archive take the row
  away and therefore say where it went; tagging and editing leave it in front of you and say nothing
  — the row is its own evidence, and a notice per tag is noise.
- **The row leaves visibly.** A routed row holds one beat wearing its state word before it goes, so
  the departure is watched rather than inferred. The notice carries where it went and outlives the
  animation.
- **The shell learns the rest by reading the log it already reads.** No push channel, no new action
  kind: a watcher polls `GET /v1/actions` on its own timer while the client is watched, from a mark
  set at start so a boot says nothing about the past.

---

## Tasks

### Phase 1 — A notice is a thing the shell can say

Depends on nothing.

- [x] Create branch `agent/notices-as-they-happen`
- [x] `CONTEXT.md` gains **Notice**: something the shell says in its own voice about work that has
      happened, in the corner, to a person who did not ask. Its _Avoid_ line names toast,
      notification, alert and banner. Distinguish it from **Action**, which is the pool's record of
      the same event and outlives the reader, and from **Refused**, which is one specific notice a
      person must clear
- [x] A notice store under `apps/ui/src/lib/`: raise, dismiss, a cap on how many stand at once, and
      the two lifetimes. Quiet notices fade on a timer; standing ones hold. It is the shell's, not
      the client's — nothing here is state the pool or the outbox owns
- [x] `Notice.svelte` beside `Refusal.svelte` in `primitives/alarm/`, in the quieter treatment: the
      accent is spent on a failure and on nothing else, which is the rule the log already follows
- [x] The `Alarm` stack takes both, with refusals **last** — the thing that must be reachable is the
      thing that will not go away on its own
- [x] The cap drops the oldest quiet notice and never a standing one. A standing notice that would
      overflow the cap collapses the stack into a count pointing at `/log`
- [x] Refusals behave exactly as they do today. This phase adds a neighbour and changes no existing
      behaviour
- [x] Tests beside it: a quiet notice fades, a standing one does not, dismissal removes it, the cap
      drops the right one, a refusal stays at the bottom
- [x] Verify: `pnpm --filter @notemap/ui test`
- [x] `git commit`

### Phase 2 — Every gesture that empties a row says what happened

Depends on phase 1.

- [x] Routing says the outcome the record carries and **never more than it knows**: a `delivered`
      record is `routed`, named by destination and by pointer where there is one; a `pending` record
      says the delivery is deferred and does not claim to have landed. The distinction is the whole
      honesty of this phase — phase 4 is what finishes the sentence later
- [x] Mark done and archive say so. Both take the row away
- [x] Tagging, editing and capture say nothing. Their subject is still on screen
- [x] A failure at a control that is still on screen stays at the control: the composer keeps its
      modal open on a refusal and the row keeps its `said`. The corner is for what has nowhere else
      to be said
- [x] The destination is named rather than identified. `client.destinations` already holds the names
      the composer drew from; an id in a notice is the shell talking to itself
- [x] Tests: a delivered record draws where it landed, a pending one says deferred and names no
      landing, marking done says so, a refusal at an open control raises no notice
- [x] Verify: `pnpm --filter @notemap/ui test`
- [x] `git commit`

### Phase 3 — The row leaves visibly

Depends on phase 2. **Droppable**: the notice carries the confirmation without it.

- [x] A row that has been routed, marked done or archived holds its place for one beat wearing its
      state word — the `StateWord.svelte` treatment the register already uses — and then goes
- [x] It is the shell's animation over its own list, not a claim about the pool. The item has
      already left the queue as far as the client is concerned, and nothing about the linger may
      make a stale row look live: it is not openable, and its actions are gone
- [x] `prefers-reduced-motion` removes the linger rather than shortening it
- [x] Tests: a routed row is drawn once more with its word and then is not; it cannot be opened
      while it lingers; reduced motion skips it
- [x] Verify: `pnpm --filter @notemap/ui test`
- [x] `git commit`

### Phase 4 — What happened while you were not asking

Depends on phase 1. The phase this plan exists for.

- [ ] **An ADR.** Why the shell learns from the log rather than being told: the pool already writes
      `routed`, `delivery-failed` and `work-abandoned` with everything a notice needs, so a push
      channel would be a second delivery of facts that are already durable — and a durable log read
      late is right where a socket dropped mid-failure is not. Say what it was chosen over: an
      SSE or websocket feed, a new `delivered` action kind, and polling the routing records of
      pending items. Record that the reachability probe cannot carry the poll, and why
- [ ] A watcher in the client, answering an observable of actions it has not answered before. It
      belongs to the client rather than the shell: the client owns the transport, the `watched`
      signal and the reachability mark, and a fake clock is how this gets tested at all.
      **Settle the name with the developer** before writing it — `client.happened` beside
      `client.reachable` and `client.undrained` is the proposal, and `ActionsApi` is the wrong home
      because it is stateless by decision and says so
- [ ] Its own timer, gated on **watched** and on reachable. Unwatched asks nothing, unreachable asks
      nothing, and coming back to either asks once
- [ ] **The mark starts at the newest action, and that first read says nothing.** A shell that opens
      by announcing yesterday is worse than one that says nothing at all
- [ ] Four kinds become notices and no others: `routed`, `delivery-failed`, `work-failed`,
      `work-abandoned`. The first is quiet, the rest stand. Everything else the log holds stays in
      the log, which is what it is for
- [ ] **Nothing is said twice.** An action the shell already spoke about — the `routed` written by
      the inline path phase 2 has just confirmed — is recognised and dropped. Match on the action id
      the watcher hands over and on the routing record in its detail, since the gesture knows the
      record and not the entry
- [ ] **`work-abandoned` on a routing record says the item is back in the queue**, because it is:
      the reservation is removed and the decision is the person's again. This is the notice that
      answers the disappearing row
- [ ] A reconnect after a long absence catches up **one page** and no further. More than that
      collapses into one standing notice with a count, pointing at `/log`
- [ ] `docs/specs/client.md` says what the watcher is, what gates it, and that it holds nothing
      across a restart
- [ ] Tests in the client, over a fake clock and a fake transport: the first read says nothing;
      only new entries are answered; unwatched stops it; unreachable stops it; a reconnect catches
      up once and is bounded. Tests in the shell: each kind draws its notice, a duplicate is
      dropped, an abandoned delivery says the item is back
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm test:stack` — the
      client's transport gains a read of its own accord, which is a layer crossing even though the
      wire is unchanged
- [ ] `git commit`

### Phase 5 — A notice names where to look

Depends on phase 4.

- [ ] Every notice about an item leads to the log narrowed to it. `logHref` already composes that
      link and carries the order with it
- [ ] Where [item-route-and-record-view](item-route-and-record-view.md) has landed, it leads to the
      item instead, which is the better address for the same question. If it has not, this is one
      href and changing it later is a line
- [ ] A notice about work with no item — `work-failed` on a subject that is not an item — leads to
      the unnarrowed log
- [ ] Tests: a notice about an item links to it; one about nothing in particular links to the log
- [ ] Verify: `pnpm --filter @notemap/ui test`
- [ ] `git commit`

### Phase 6 — The specs catch up

Depends on every phase above.

- [ ] `docs/specs/shell.md` — **Reachable, pending, refused** becomes four things the corner says,
      with the rule that separates them: pending heals itself and stays quiet, a notice is a fact
      about work that has already happened, a refusal will not resolve without a person. Say that a
      gesture speaks only when its subject leaves the screen, and that a failure at a control that
      is still on screen is said at the control
- [ ] The same section's sentence about the log — that the accent is spent on three kinds — is where
      the notice set is stated, so the two lists cannot drift
- [ ] `docs/design/` is caught up: the stack now holds two shapes and the corner is drawn with both.
      **[typed-routing-composer](typed-routing-composer.md) phase 8 re-shoots every surface** — the
      second of the two to land does the shooting rather than both doing it
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`
- [ ] `git commit`

---

## Out of this slice, deliberately

- **Seeing deliveries in flight as a set.** A routed item is out of the queue while its delivery is
  pending, and nothing lists what is outstanding. Notices report each one as it resolves, which is
  most of the pain; a surface for the set is a different thing and belongs with
  [item-route-and-record-view](item-route-and-record-view.md).
- **Notices for anything the outbox does.** Pending is quiet by decision and refused already has its
  corner. Nothing about that changes here.
- **Notifications outside the tab.** The browser's own notification permission, a service worker, a
  badge. A notice is something the shell says to someone reading it.

---

## Unknowns

- **Whether the queue can hold a row the client has already dropped.** Phase 3 needs the surface to
  draw one more frame of an item that has left its page. Fallback: keep the row's last-drawn values
  in the component rather than asking the client for them, which is enough for a word and a stamp.
- **What the poll costs on a phone.** One `GET /v1/actions` per interval while watched, against a
  daemon on the same network for most of this project's life. Fallback: lengthen the interval, or
  ask only after a gesture and on regaining reachability, which catches the case that prompted this
  plan and drops the idle one.
- **A pool-wide log means another device's failures speak here.** Correct for one person with one
  pool, and arguably the point — a delivery failing is worth knowing wherever you are. Fallback:
  narrow to items this client has touched, which the cache can answer.
- **Whether the deferred `routed` arrives while its item is nowhere on screen.** It will, often —
  that is the case this is for — so the notice must read on its own without the row beside it.
  Watch it in use rather than deciding the copy now.
- **Whether `routed` as a quiet notice is too quiet when a person routes ten things in a row.**
  Ten fading notices is a column. Fallback: collapse consecutive confirmations into one that counts.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The store, the stack and every drawn notice are the shell's and test beside them, as
`alarm.test.ts` and `Refusals.test.ts` already do. The watcher is the client's and tests over a fake
clock and a fake transport, with no DOM: the timing rules — first read silent, gated on watched,
bounded catch-up — are the part most likely to go wrong and the part cheapest to test there.
`pnpm test:stack` is part of finishing phase 4 alone.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
