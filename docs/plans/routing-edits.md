# Routing edits

**Date**: 2026-09-10
**Status**: Todo
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/shell.md`
**Closed**:

---

## Goal

A person filing an item can change the words that delivery carries, without changing the item —
so one capture reaches two destinations in two wordings, each routing record holding the one it
sent.

---

## What this is

`todo.md:129` has carried *routing edits* since the beginning and settled it on 2026-08-24 as
**amend, then route**: two operations that already exist, made one gesture by a frontend. That
settlement is wrong, and its own `NOTE` says why — an item routed to two places in two wordings has
no single amended form, so the last route would win and the capture would end up a function of its
delivery history. That is the same objection
[ADR 19](../adr/0019-a-destination-converts-and-the-delivery-records-what-went.md) raised against
amend-then-route as a conversion mechanism, and it applies unchanged to amend-then-route as an
editing gesture.

So: **a delivery may carry its own content.** The request gains one beside its arguments, core
validates it against the item's payload type's own `contentSchema` — the identical check a capture
gets — and substitutes it into the delivery it projects. The capture is untouched, and the routing
record holds the words it sent, so what went is answerable per delivery rather than per item.

**You own the words; the destination owns the shape.** The content is the *input* to a conversion,
not a replacement for one: a template's `- [ ]`, the frontmatter, the `#tag` foot and the asset
links all apply to the supplied words exactly as they would have applied to the capture's. The two
compose. Where an automatic conversion is configured stays open as `todo.md:140`.

**The record carries it, so a sleeping vault still works.** A deferred delivery is attempted from
the record alone, so a reservation holds the content, mirrors it and replays it on every retry.
This moves a line [ADR 33](../adr/0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md)
drew deliberately, and phase 1 is where that argument is made rather than assumed: what 33 refused
was the destination's **converted output**, produced before the destination was reached and stale by
the time a deferred delivery ran, and impossible to mean for a capability that resolves itself
against the vault at write time. A person's words are a decision rather than a conversion, and are
as true in six hours as when they were typed.

Three things it deliberately is not.

- **Not an amendment.** The row keeps `edit`, which rewrites the capture in place, permanently, for
  the feed and every later route ([ADR 21](../adr/0021-an-item-is-editable-until-it-is-processed.md)).
  The composer gains `rewrite`, which is this delivery and nothing else. Two words for two acts,
  because two controls an aisle apart both called `edit` is how somebody permanently rewrites a
  capture meaning to fix one delivery.
- **Not a clone.** `todo.md:136`'s note proposed copying the capture and routing the copy. It is
  dropped: it makes an item nobody asked for and puts a twin in the queue.
- **Not a template's business.** A template carries no content. Fixed words for every capture it
  ever files is absurd, and patterned words are the body patterns parked on 2026-09-10.

---

## Tasks

### 1. The decision, written down

Depends on nothing. Nothing else in this plan is safe to build before the ADR exists, because the
whole of it rests on one distinction an existing ADR appears to forbid.

- [x] Create the branch `agent/routing-edits`
- [x] An ADR: **a delivery may carry its own content, and the reservation holds it.** It extends
      ADR 19, amends ADR 33's line about bytes in a reservation, and states the distinction that
      permits it — a converted output is the destination's and goes stale; supplied content is the
      person's and does not. Record the two options refused: amending the capture (ADR 19's own
      dead end, re-reached from the editing side) and cloning it
- [x] The ADR also answers, for the hand-made case only, `todo.md:140`'s open question about where a
      conversion is configured: content is a first-class field of the request, **beside** the
      arguments rather than inside them, because a path and a person's prose are not the same kind
      of thing and only one of them is a destination's to interpret
- [x] `CONTEXT.md` gains **Rewrite**: the words one delivery carries in place of the capture's,
      supplied by a person when the decision is made and held on the routing record. The entry has
      to draw its own line — `todo.md:129` and ADR 19 both use *rewrite* for the forbidden thing,
      and what they forbid is rewriting the **capture**, where this rewrites the **delivery**.
      _Avoid_: amendment, revision, edit, conversion — each of which is a different act already
      glossed
- [x] Verify: the ADR reads as an argument someone could disagree with, and `CONTEXT.md`'s new
      entry is reachable from **Delivery**, **Conversion** and **Output** without either of them
      changing meaning
- [x] `git commit`

### 2. Core

Depends on phase 1.

- [ ] `DeliveryRequest` gains `content?: JsonObject`
- [ ] `checkFor` validates it against the payload type's `contentSchema`, refusing
      `content-invalid` with `issues` — the sibling of `arguments-invalid`, whose shape a shell
      already knows how to draw. Absent content is not a refusal and never was one
- [ ] `PoolConfig` reaches the routing path. It does not today: `route`, `preview`, `prepare`,
      `prepareFor` and `checkFor` all take `ports` alone, and `checkPayload` needs the config that
      holds `payloadTypes`. `pool.ts` has it at every call site, and `templates/fire.ts` is the
      fourth caller
- [ ] `projectDelivery` substitutes the content into the payload it projects. `payload.assets` sits
      outside `content` and is untouched, so a rewrite cannot silently drop a picture
- [ ] The destination target on `RoutingRecord` carries the content, so a deferred delivery replays
      the words the decision was made with. Absent means *use the item's*, which is a record written
      before this existed and every record nobody rewrote — no flag, the presence is the fact
- [ ] The store needs no migration: a record's `target` is already one opaque JSON column
      (`migrations.ts:469`)
- [ ] Verify: `pnpm --filter @notemap/core test` — a route with content delivers those words and
      leaves the item saying what it said; two routes with two contents leave two records; invalid
      content refuses before anything is written. And a mirror round-trip test: a record with
      content written and read back is the same record
- [ ] `git commit`

### 3. The wire and the client

Depends on phase 2.

- [ ] The route and the preview request bodies accept `content`. Preview takes what a delivery takes
      and needs no argument of its own for this — `prepare` is shared, so previewing a rewrite works
      the moment routing does
- [ ] `http-v1.md` says so, and says that `content-invalid` is a refusal with issues
- [ ] The client passes it through on `route` and `preview`. Neither is an outbox operation and
      neither becomes one: a delivery is a decision that has to reach the pool to mean anything
- [ ] Verify: `pnpm --filter @notemap/integration-tests test` — a rewrite over `/v1` lands the
      supplied words at a real destination, and a preview of one answers them converted. This is the
      layer where the mechanism is provable without a shell in the room
- [ ] `git commit`

### 4. The composer

Depends on phase 3.

- [ ] A `words` block in the composer's **right** column, directly above `would write`, so
      rewriting and previewing are one loop: what is being sent above what it becomes. It is a
      `Labelled` rather than a `Group` — the right column is terse rows beside the decision, which
      is what the left column's line is
- [ ] `rewrite` opens the words for typing. Drawn only where a real destination is taken: `manual`
      and `discard` deliver nothing, and have nothing to rewrite
- [ ] The words survive a change of destination, where the arguments are cleared. A place in one
      vault means nothing in another; words are not about the destination at all, and clearing them
      would make somebody re-type a typo fix for picking a different board
- [ ] Each route starts from the capture. A rewrite belongs to one delivery and is never sticky —
      wanting the fix everywhere is wanting `edit`, and that division is what keeps the two words
      meaning different things
- [ ] The preview is **cleared** when the words change, never left standing. A preview of words that
      have since changed is indistinguishable from a good one, which is the exact failure ADR 33
      names
- [ ] An empty rewrite is whatever the payload schema allows. No rule is invented here: a capture
      carrying assets and no text is already legitimate
- [ ] `shell.md` — the composer's section gains the words and `rewrite`, and says plainly that the
      row's `edit` is the other thing
- [ ] Verify: `pnpm --filter @notemap/ui test` — the words draw the capture; `rewrite` and typing
      then routing sends the typed words; changing destination keeps them and clears the arguments;
      a second composer on the same item starts from the capture again; the preview clears on a
      keystroke; `manual` draws no words
- [ ] `git commit`

### 5. The specs, and what this closes

Depends on phases 1–4.

- [ ] `core.md` — the routing section gains a delivery carrying its own content, beside what it
      already says about a destination converting a copy. The two are different halves of the same
      sentence and should read as such
- [ ] `mirror.md` — where it describes what a routing record carries, if the round-trip in phase 2
      turned out to need saying
- [ ] `todo.md:129` — **rewritten, not ticked.** Its settled line says *amend, then route*, which is
      the wrong mechanism, and its `NOTE` says why in the same entry. Close it naming what replaced
      it, and drop the clone note at `:136`
- [ ] `todo.md:140` — narrowed rather than closed: the hand-made half is answered, the automatic
      half is not
- [ ] `todo.md:62` and `:109` stay open, and each says that the composer's `rewrite` did not reach
      it: editing still attaches nothing, and nothing in the shell can still ask for a revision
- [ ] Verify: `pnpm typecheck`, `pnpm -r --silent test`, `pnpm lint`
- [ ] `git commit`

---

## Unknowns

- **Whether `content-invalid` is worth its own refusal kind, or whether `arguments-invalid` should
  widen.** A separate kind says which of the two a person got wrong, which matters when the composer
  is drawing both. Fallback if it proves noise: one kind carrying a field naming what it was about.
- **What bounds the content.** A record's arguments are unbounded JSON today and nothing caps a
  capture's text either, so this adds no new *kind* of problem — but it puts a copy of a capture's
  prose on a record that is mirrored and replayed, per rewritten delivery. Nothing here caps it.
  Fallback if a long capture makes records unpleasant to read or to page: a bound supplied beside
  the clock and the grace window, as the host's other operational knobs are.
- **Whether the words belong above `would write` or below it.** Above reads as input-then-output and
  is what phase 4 builds. If the preview turns out to be the thing a person looks at while typing,
  the two want swapping, and that is a layout change with nothing behind it.
- **Whether a rewrite should be reachable at all when the destination cannot be reached.** It is, by
  construction — the reservation holds the content. Worth watching whether a person rewriting into a
  sleeping vault understands that nothing has landed, which is the pending mark's job and not this
  plan's.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Phase 2 is where the substitution and the replay are provable, phase 3 where the mechanism is
provable end to end without a shell, and phase 4 where only the drawing is left to check. The
ordering is deliberate: each phase's verify step tests something the phase above it cannot.

This crosses the layers — the HTTP surface, the client's transport and core's own contract — so
`pnpm test:stack` belongs at the end of phase 3 and again at the end of phase 5.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed
and linking back to this plan. No implementation details, no granular tasks. A plan marked Done
whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
