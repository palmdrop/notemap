# Review: The shell design port

**Date**: 2026-08-20
**Status**: Resolved
**Scope**: `apps/ui/`, `packages/client/src/{types,client}.ts`, `packages/client/src/{state,surfaces}/`, `docs/`
**Plan**: `docs/plans/shell-design-port.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`

---

## Overall

The port lands what it set out to land. The token block clears Tailwind's three namespaces so a
component naming a colour does not compile, `tokens.test.ts` catches what the compiler cannot, and
the primitives carry the register's whole geometry — the spine, the T-junction separator, the two
breakpoints — without a component ever naming a measure. The `loaded()` rewrite in `state.ts` is a
real fix hiding inside a feature: the old predicate assumed oldest-first and was wrong for the feed
whichever way you read it. Typecheck, lint, `pnpm -r test` and `pnpm test:stack` are all green, and
both specs carry a dated `Shipped:` entry for a plan marked Done.

The one defect worth stopping for is finding 1: the order guard in `loadMore` protects the new page
rather than the held one, so turning a surface around while a read is in flight does exactly the
stitching the comment above it says it prevents. Reproduced.

Two places where the shipped thing is not the specified thing — the empty state and the queue row's
last touch — are findings 3 and 4, and both have a ticked box in the plan.

---

## Bugs

### 1. Turning a surface around mid-read stitches two orders into one page

`packages/client/src/surfaces/reads.ts:74-82` — the `loading` guard is applied to `page`, which on a
turn is a freshly minted `emptyPage(order)` and is therefore never loading. The held read is not
cancelled and its resolution writes into whatever the surface has become:

```
loadQueue()                  → oldest-first read in flight, held.loading = true
loadQueue("newest-first")    → page = emptyPage(...), loading false, guard passes, second read starts
newest-first resolves        → queue = { order: newest-first, ids: [newest], after: NEWPOS }
oldest-first resolves        → extended(current[surface], slice)
                             → queue = { order: newest-first, ids: [newest, oldest], after: OLDPOS }
```

The list holds rows from both ends, and `after` now belongs to the order the surface is not in, so
the next `load more` walks oldest-first from a position no newest-first read produced. `exhausted`
comes from the stale slice too.

Reproduced against `mockTransport` with the oldest-first response held open: `['newest', 'oldest']`.

The shell reaches it. `OrderSelector` is never disabled, and `Queue.turn` and `Feed`'s `onchoose`
call straight through while `$queue.loading` is true — which on a slow pool is the whole window in
which a reader is looking at the control and deciding.

Fix: guard on `held.loading`, not on `page.loading`. `held.exhausted` must stay out of it, since
turning an exhausted surface around is the case that has to keep working. If a turn should be able
to pre-empt a slow read rather than be refused by it, then the read needs a token — capture the
order the request started in and drop a resolution whose order no longer matches.

### 2. The capture row's stamp is not the time the capture keeps

`apps/ui/src/components/capture/CaptureRow.svelte:22-26` — the row runs its own clock on a 20-second
interval, and `client.capture` mints `capturedAt` from the client's `now()` at submit
(`packages/client/src/capture/envelope.ts:29`). The two are never the same value.

`shell.md` says of this row: "The compose field is the row it is about to become, and the date it
shows is the one the capture will keep." At minute resolution the skew only shows when the tick and
the submit fall either side of a minute boundary, which is most of a 20-second window's worth of
captures — the row reads `14:07`, the item lands at `14:08`, and it sorts and displays against the
one the reader did not see.

Fix: mint the stamp once at submit and use it for both, which means `CaptureInput` carrying an `at`
or `capture` accepting one. Failing that, tick the clock at the minute boundary rather than every
20 seconds, so the displayed minute is always the current one.

---

## Design

### 3. The queue's empty state is a sentence

`apps/ui/src/components/queue/Queue.svelte:78-88` — the drained queue renders one row: a `queue`
label and the prose "Empty — everything captured has been processed or has left the pool."

Plan, phase 3: "Design the empty state as a surface rather than a sentence — it is the thing the
queue exists to reach." Spec, acceptance criteria: "The queue's empty state is a designed surface,
not a sentence." The box is ticked and the spec's Shipped entry does not list this among what did
not land.

This is the state the whole surface is pointed at, and it currently reads as an apology in a
register row — which is the second thing the spec forbids. Either draw it, or say in the spec that
it was not drawn. Not both.

### 4. The collapsed queue row does not carry the last touch

`apps/ui/src/components/queue/QueueRow.svelte:113-119` — `edited` sits inside `{#if opened}`.

`shell.md` puts it on the collapsed row, on the queue only, with the reason attached: "that is the
key the queue is ordered by and an item revised last night sits at the newest end for no visible
reason otherwise." The rationale is entirely about scanning the list. Behind a row that has to be
opened one at a time, it answers nothing.

Not among the four things the Shipped entry names as not shipped, so as it stands the spec claims
it and the code does not have it.

### 5. `Register`'s second column is reserved by a grid that nothing occupies

`apps/ui/src/components/primitives/register/Register.svelte:13-19` — with `aside` the grid becomes
`1fr var(--spacing-panel)` and still renders exactly one child. The panel column exists so the
absolutely-positioned composer has somewhere to be, and the row's height is separately reserved
through `Row`'s `--reserve` and the composer's `ResizeObserver`.

It works, and the two comments carry it. But the register now keeps room for the composer in three
places that do not know about each other — a grid column here, a `min-h` on the row, and a measured
callback threaded `Composer → RoutingComposer → QueueRow → Row`. A composer that is anything other
than exactly one panel wide, or open on two rows, breaks silently. Worth a note in the spec about
which of the three is the contract.

---

## Minor

### 6. `Stamp` writes the same markup twice

`apps/ui/src/components/primitives/marks/Stamp.svelte:27-52` — the `time` and the clock span, with
their `max-narrow:` classes, appear once for the static branch and once inside the button. The
plan's goal sentence is "no class string describing the same thing appears in two places"; a
`{#snippet}` rendered by both branches says it once.

### 7. `OrderSelector` re-declares `Order`

`apps/ui/src/components/primitives/controls/OrderSelector.svelte:2` — the type is exported from
`@notemap/client` and redefined here. Structurally identical today, so nothing catches a drift.
Defensible if the intent is that a primitive holds no domain type — but then it also holds the map
from those two names to "oldest"/"newest", which is domain vocabulary either way. Import it.

### 8. The refusal block and the theme toggle share the bottom of a phone screen

`primitives/alarm/Alarm.svelte:9` is `fixed bottom-4 left-4 max-w-84`; `theme/ThemeToggle.svelte:11`
is `fixed right-4 bottom-4`. At 375px a refusal wide enough to reach its 21rem cap ends at x=352 and
the toggle starts near x=318. The toggle is later in the layout and wins the stacking, so it sits on
top of the refusal's text. The spec's reasoning for the two corners assumes they do not meet.

### 9. Settings restates unreachability, in the accent

`apps/ui/src/components/destinations/Destinations.svelte:73-81` — "destinations can be read but not
changed" under a `daemon` label, in `text-accent`. The sentence earns its place: it names the
exception, which the chrome's mark does not. The colour does not — the accent means action or alarm,
and the spec is explicit that an unreachable pool is the ordinary condition and is not dressed as a
failure. Muted ink.

Two rows down, `<Label name="refused" />` labels a direct API failure. `CONTEXT.md` now defines
**Refused** as an outbox operation the pool answered no to; destination edits bypass the outbox by
design, so this is not one.

### 10. `RoutingComposer` sets a message it then unmounts

`apps/ui/src/components/routing/RoutingComposer.svelte:110-111` — `said = "routed — <state>"`
followed by `onclose()`. Nobody reads it. Either drop the assignment or report the outcome somewhere
that survives the composer.

### 11. `shell.md` links to a directory the branch gitignores

`docs/specs/shell.md`, Visual direction: "against the references in [docs/inspiration/]". The same
branch adds `docs/inspiration/` to `.gitignore`. The frozen exploration docs already link there, so
this is a pattern rather than a new sin — but a live spec resting a settled decision on evidence
nobody who clones can open is different from a frozen one doing it. Either commit the references or
describe them in the spec.

### 12. `shell.md`'s status is not one of the template's

`docs/specs/shell.md:3` — `**Status**: Built`. `docs/specs/_template.md` offers
`Draft | Stable | Implemented`, and every other spec uses one of them or explains itself.

---

## Non-issues

- **`became()` returns `superseded` and `revision`, which the spec's state-word list does not name.**
  The spec names `routed` and `archived` for the feed and separately requires revision lineage to be
  legible on a collapsed row. One inverted word carrying both, later fact winning, is the economical
  reading of the two requirements.
- **`routed`, the `sent` line, the folder tree, CommonMark and the pending mark are absent.** All
  four are named in the spec's Shipped entry as not shipped and carried into `todo.md` with what
  each is blocked on.
- **`Queue`'s `onMount` fetches a further page on every remount** rather than showing what the
  client holds, so queue → feed → queue grows the list. Present on `main` unchanged; out of this
  diff's scope.
- **No test asserts a class string except `tokens.test.ts`.** Checked; that one is a test about class
  strings on purpose, as the plan says.
- **`--spacing-*` is not cleared alongside the other three namespaces**, so `gap-3` and `max-w-84`
  still resolve. The gate is about roles that carry meaning; a spacing step does not.
- **`ssr = false` in `+layout.ts`** is what lets `theme.svelte.ts` read `localStorage` at module
  scope. Deliberate, and the pre-paint script in `app.html` is the other half.

---

## Resolution

Reconciled with the developer's own review on PR #19. The two reviews found nothing in common;
finding 13 is theirs, the rest are this file's.

1. **Fixed.** `loadMore` returns on `held.loading` before the turn is considered, so a read in
   flight can no longer be raced by a second one. Exhaustion is still judged on the new page, which
   is what keeps turning an exhausted surface around working. Two tests: one holds the first read
   open and turns around under it, one turns an exhausted surface. `OrderSelector` also takes
   `reading` and holds itself while a read walks, so the control can never show an order the
   surface is not in.
2. **Fixed.** The compose row's clock now turns over on the minute boundary rather than every 20
   seconds, so the minute it shows is the minute `capturedAt` gets. A sub-millisecond window at the
   boundary itself remains; closing that would mean the shell handing the client a capture time,
   which is domain logic the shell does not hold.
3. **Fixed.** `queue/Drained.svelte`. The drained queue is the state word idiom at surface scale —
   an inverted `zero` in the left column, where the feed says what became of an item, saying what
   became of the whole surface — over a `cleared` block that gives it the room a surface has rather
   than the room a row has. The utility is in `styles/utilities.css`, so the component still names
   no measure.
4. **Fixed.** The last touch is read on the collapsed queue row wherever there is one. Only its
   absence — `not since capture` — waits for the row to open, having nothing to explain. `shell.md`'s
   "Opened, a row is for triage" paragraph changed with it.
5. **Won't fix in code.** The three-part arrangement works and pulling it apart would buy nothing
   today. The gap was that nothing said which part was load-bearing, so `shell.md` now states it:
   the row's reserved height is the contract, and a composer wider than one panel or open on two
   rows is outside what it holds.
6. **Fixed.** A `{#snippet written()}` rendered by both branches of `Stamp`.
7. **Fixed.** `OrderSelector` imports `Order` from `@notemap/client`.
8. **Fixed.** The alarm block takes `right-20`, so it stops clear of the palette control instead of
   being sat on by it at 375px.
9. **Fixed.** An unreachable pool reads in muted ink on settings — it is the ordinary condition, not
   an alarm. The `refused` label is now `failed`, since a destination edit bypasses the outbox and
   `CONTEXT.md` reserves **Refused** for what the outbox carries.
10. **Fixed.** The assignment is gone; the composer closes on success and says nothing it will not
    be around to show.
11. **Fixed.** The Visual direction section no longer links to the untracked directory. It says the
    references are held outside the repository and that nothing in the spec rests on opening them.
12. **Fixed.** `Implemented`, which is the template's word.
13. **Fixed** (the developer's finding). The global stylesheets moved to `apps/ui/src/styles/` —
    `tokens.css`, `utilities.css`, `base.css` — and `routes/layout.css` is now the import list that
    pulls them in. Two things had to move with them: `shell.md` said tokens live in
    `routes/layout.css`, and `tokens.test.ts` scanned only `components` and `routes` while exempting
    the filename `layout.css`, which would have put the whole new directory outside the gate. The
    gate now scans `styles` too and exempts `tokens.css` by path, with a test asserting it reaches
    the directory at all.
