# Review: Loading and motion in the shell

**Date**: 2026-09-25
**Status**: Addressed — every finding taken, 2026-09-25; see the plan's phase 8
**Scope**: branch `agent/loading-and-motion` against `main` (PR #78): `apps/ui/src/lib/{motion.ts,moving.svelte.ts,log.svelte.ts,outputs.ts}`, `apps/ui/src/components/**`, `apps/ui/src/styles/*`, `apps/ui/vite.config.ts`, `docs/specs/shell.md`, ADR 0046, `CONTEXT.md`
**Plan**: `docs/plans/loading-and-motion.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

Phases 1–6 match their goal. The asking mark is one primitive and every busy button, region
and cold read uses it, and the list rule ("what a read brought never moves") is a small,
tested function. Phases 7–8 work too. What they left behind is mostly bookkeeping: the plan's
*Decisions taken* still states things phase 8 reversed, and the spec's `Shipped:` entry was
written before phase 8 and does not mention it. Two real defects. The most important is a
template whose destination fails to describe itself, which leaves the `place` section showing
the asking mark forever (#1). The other: a row's `growing` defers any change that lands while
it is already moving, so a gradual change inside a row (`+ N lines` on a clamp) grows a little
and then snaps (#2). Typecheck (`svelte-check`), the ui tests, eslint and prettier are all
green. `test:stack` was not run; the only change near a layer boundary is the dev-only proxy.

---

## Bugs

### 1. A template whose destination cannot describe itself leaves the asking mark up for good

`apps/ui/src/components/process/Process.svelte:599-627, 1033` — `take()` sets `applied`, resolves
the template, then calls `choose()`. When `describe` answers unavailable or throws, `choose()`
catches it and sets `chosen = undefined`, but it does not rethrow, so `take()`'s own `catch`
never runs and `applied` is never cleared. The new first branch of the place section is exactly
that state:

```
take(t) → applied = t → choose(dest) → describe fails → chosen = undefined (caught)
→ applied still set → `chosen === undefined && applied !== undefined` → <Asking /> forever
```

The refusal lands on the destination's option, but the section keeps asking about a request that
has already been answered. The leak of `applied` is older than this branch: it already suppressed
the preset seeding at `:233`. The mark is what makes it visible. No test covers a template whose
destination fails to describe.

Fix: clear `applied`/`resolved` in `take()` when `choose()` leaves `chosen` undefined, and add a
test for it.

### 2. `growing` snaps a row whose height changes gradually from inside

`apps/ui/src/lib/motion.ts:205-230`, reached through `Clamp.svelte:34-39` inside `Row.svelte:98`.
While the box has any animation running, `growing` does not retarget. It waits for the animation
to finish and then only re-measures. `following` handles exactly this case correctly, by turning
from `getBoundingClientRect()`. A nested `grow` feeds `growing` a height that changes every frame:

```
`+ 12 lines` → Clamp grows its box over `short`
→ frame 1: the row's ResizeObserver sees +Δ₁, no row animation yet → grow(row, was) to height+Δ₁
→ frames 2…n: row is animating → callbacks only queue `measure` after `finished`
→ row's animation ends at +Δ₁ (overflow hidden clipped the rest) → row jumps to full height;
  `measure` already took the new height, so the next observation sees no change
```

With `ease-motion`, Δ₁ is a large share of the first frame's progress, so the row visibly grows
part of the way, holds, then jumps. This is reasoned from the code, not seen in a browser. The
same applies to any gradual change inside a row or a heard log row. The spec's *Draining* promises
"a row that changes height in place grows or shrinks into it". The unit test at
`motion.test.ts:291` pins the deferral as intended behaviour.

Fix: have `growing` retarget the way `following` does, from the box's current rect, rather than
waiting. `grow()` already cancels and restarts, which is what makes the retarget safe. The two
helpers would then differ only in what they measure (#6).

---

## Design

### 3. The spec's `Shipped:` entry does not cover phase 8

`docs/specs/shell.md:7-17` — the 2026-09-25 entry describes phases 1–7 (the mark, list motion,
the corner, disclosure, the jumps). Phase 8 is missing entirely: the single 72rem measure (and the
ADR 46 amendment), the tag chooser and tags moving, the capture box's ruled picture section,
`ease-fade`, bold words that hold their width, the log's fade and still tabs, and settings forms
following their height. The entry still says "Durations are three tokens" and says nothing of the
two easings. The plan is **Done**, so by the review rule this is lost history.

### 4. The plan's *Decisions taken* now contradicts the code and the spec

`docs/plans/loading-and-motion.md:20-63` — its preamble says "Two turned out otherwise". More did,
and the section still states them as decided:

- `:56` "Overlays — … the tag chooser … — do not move." The tag chooser now widens and unrolls
  (phase 8; spec *Motion*).
- `:60` "one `--ease-motion`". There are two; `ease-fade` was added.
- `:146` (phase 5 task) "The log follows the same rule on its own `loading`." The log now uses
  `heard` instead (phase 8), and `moving()` is not used by the log at all.
- "Disclosure … height slides over `short`, no fade". The capture box's picture section slides
  **and fades**, over `long` (`Capture.svelte:126`; see #13).
- Phase 2 ticks "`check again` on a destination, a template and the server" as moved onto the
  mark. In the code, `check again` is only `disabled`, and the mark stands in the status fact
  instead (`Destination.svelte:225`, `Template.svelte:202`, `Server.svelte`). That is a
  reasonable shape, but not what the ticked box says.

Phases 7–8 record the reversals, but a reader of *Decisions taken* gets the old answer. Either
strike the reversed lines with a pointer to the phase that reversed them, or extend the preamble's
list.

### 5. The log's fade treats every restart as a turn, including entering the surface

`apps/ui/src/lib/log.svelte.ts:141` and `apps/ui/src/components/log/Log.svelte:31-52` — `turning`
is `loading && !answered`, which is true after **any** `restart()`, not only after a view, order
or subject changes. Two consequences:

- `raced()` (the watcher found more than a page) fades the whole log out and back in. The spec
  (*Only what the watcher brings moves*) lists a re-read among the things that stand still, and
  lists only "another view, the order, the subject" as fading. The getter's doc comment names the
  same three.
- `drawn` is seeded with `untrack(() => log.rows)` when `Log` mounts, and the page's `$effect`
  calls `log.reading()` after that. Entering `/log` at a reading other than the last one held (a
  different item's `history`, a different `kind`) therefore mounts the **previous reading's rows**,
  then dims them and holds them for `short` before the new answer can be drawn. These rows are
  probably dimmed before first paint, so they may never be seen. They are still mounted,
  focusable and clickable under a `HISTORY` head that names the new item, and a fast answer is
  delayed by the fade.

A turn is something `Log` could be told about: an explicit flag set by `reading()` and `turn()`,
or `drawn` seeded empty when the reading at mount is not the one held, rather than inferred
from `loading && !answered`.

### 6. Two near-identical height-following helpers with different mid-motion rules

`apps/ui/src/lib/motion.ts:169-230` — `following` (measures the child, retargets mid-motion) and
`growing` (measures itself, defers mid-motion) do the same job, and only one handles a change that
lands while the box is moving. #2 is the consequence. Settings forms and process sections
retarget, and rows do not, for no reason a reader can recover. Also, `following` guards
`typeof node.getAnimations === "function"` and `growing` does not. Fold them into one rule, or
say in `growing`'s doc comment why a row must not retarget.

### 7. A pending row grows a line 250ms after every mount

`apps/ui/src/components/primitives/marks/Pending.svelte` — the mark now waits `SHOWN_AFTER` on each
mount, not only once for fresh work. A row that is genuinely pending (offline, several captures
waiting) is drawn without its `pending` line every time the queue or feed is visited, then grows
one (through `growing`) a quarter-second later. That is the "grew on every visit" jump phase 7
fixed for log outputs, now for pending rows. The delay should key on how long the work has been
undrained, not how long the component has been mounted.

### 8. The outputs cache outlives a sign-out

`apps/ui/src/lib/outputs.ts` — a module-level map of what deliveries sent (user content), cleared
only by `forgetOutputs()`, which only tests call (`testing/dom.ts:144`). Sign-out in
`Access.svelte:33` calls `log.forget()` because "these rows are the pool's … so a sign-out drops
them with everything else it cached". The outputs are the pool's for the same reason and stay in
memory. Call `forgetOutputs()` beside `log.forget()`.

### 9. Tests that assert class strings rather than decisions

The plan's testing rule is "decisions, never the frames". Most new tests hold to it: the mark's
timing, the slow word, the list rule, `heard`, the held reading, outputs read once. Several assert
utility classes or generated CSS instead:

- `controls.test.ts` checks `outline-ink` for the selected tag and `invisible` for the held `+`
  and the working label.
- `marks.test.ts` checks `font-normal` / `max-narrow:hidden` on the stamp's spacer.
- `motion.test.ts:73` matches `min-height: 0;opacity: 0.5`, and `:195` matches `max-width: 100px`.

These break on a restyle that keeps the decision. Assert through a role, `aria-*` or a `data-`
state where one exists, as `data-asking` already does.

There are also gaps: nothing covers the tag panel's retargeting (`TagSet.svelte:122-135`),
`Unfolding`, a heard `LogRow` moving while a read row stands still (only the store's `heard` is
tested), or #1.

---

## Minor

### 10. A dead assertion and stale `loading…` wording

`Process.test.ts:1895` and `:3424` assert `queryByText("loading…")` is null. No component draws
that string any more, so these can never fail. Check `[data-asking]` instead, as the adjacent
assertions do. `Process.test.ts:1859` and `lib/candidate-cache.ts:11` still describe the wait as
`loading…`.

### 11. `moving()` treats the first capture into a drained queue as a fill

`apps/ui/src/lib/moving.svelte.ts:257` — `held === 0 && size > 0` is how the cache filling a
reloaded list stands still, but it also catches a capture landing on an empty queue. That capture
appears without sliding, although *Draining* says a capture landing slides. It is rare, but the
rule and the spec disagree on it. Either the spec names the case, or the fill is detected by the
first update after mount rather than by the count.

### 12. The selected row's foot fades, but the cells it replaces do not

`apps/ui/src/components/item/Row.svelte:139-149` — the selected foot has `transition:fade`. The two
unselected cells (one carrying the rail's rule through the foot) appear and vanish at once, so that
segment of rule blinks while the box's edges fade. The spec (*Motion*) says "the one leaving and
the one arriving in step".

### 13. The capture box's picture opens over `long`

`apps/ui/src/components/capture/Capture.svelte:126` — `slide` defaults to `long`. Every other
disclosure (sections, settings rows, forms, `+ add`) passes `magnitude: "short"`, and the spec
classes opening in place as `short`.

### 14. Destinations' `+ add` does not slide shut as its form opens

`apps/ui/src/components/settings/Destinations.svelte:190-200` — Accounts, Templates and Access
slide their `+ add` shut. Here it is swapped for an empty `<span>` at once, because it shares a
line with `N disabled · show`. The spec says "a `+ add` sliding shut as its form opens" without
exception.

### 15. `← previous` / `next →` fade the next item up too

`ProcessPage.svelte`'s `{#key item.id}` and `Process.svelte:880`'s `in:rise` apply to any change of
item, not only to the advance after a decision. The spec describes only the advance, and says "No
navigation moves". Walking previous/next is arguably navigation. Name it in the spec either way.

### 16. `TagSet`'s `panel` is `null`, not `undefined`, after the panel closes

`TagSet.svelte:122-135` — Svelte 5 sets a `bind:this` to `null` on teardown, so
`panel !== undefined` does not guard anything. It is safe today only because the `$effect.pre` also
re-runs on `panel` and resets `tall` to `undefined` before the `$effect` runs. If that ordering
ever changes, `grow(null, …)` throws as soon as a duration is non-zero, which never happens under
test. Guard on `panel == null` or type it `HTMLElement | null`.

### 17. Small leftovers

- `motion.ts:135-139`: `grow`'s doc comment still describes it as "what a `more` opens". It is now
  also the engine behind `following`, `growing` and the tag panel.
- `motion.ts:39`: `easing` is exported but nothing outside the module uses it.
- `Process.svelte:881`: `wide:max-w-measure` duplicates `Column`'s `max-w-measure` now that there
  is one measure.
- The font's URL is written twice, in `app.html` (preload) and `tokens.css` (`@font-face`). Nothing
  keeps the two in step.
- shell.md *Tokens and themes*: "All three are zero under `prefers-reduced-motion`" follows a list
  of three durations and two easings. Say "the durations".

---

## Non-issues

- **`ASKING = "loading"` as the mark's screen-reader word** — CONTEXT.md's *Asking* is "the
  concept, not the word a shell prints for it", and the spec keeps `loading` off screen only.
- **ADR 46 edited in place** — the change is an appended, dated *Amended* note, and the old
  reasoning stays readable. That is a superseding note, not an erasure.
- **`grow()` cancels every animation on its node** — safe for its current callers. `growing` only
  calls it when none run, `following`'s node carries no Svelte transition (Unfolding's `slide` is
  on the outer div), and the tag panel's `slide|global` is on the panel's wrapper.
- **`slide|global` on the tag panel** — needed so the panel unrolls when the line opens, which is
  the parent block.
- **Sliding and rising fades on `ease-motion`** — the spec scopes `ease-fade` to what changes in
  place. Rows, notices and the process advance travel.
- **The log's fade timed by `setTimeout(duration("short"))`** — it reads the same token as the CSS
  transition, and both are zero under reduced motion.
- **`/log` dropped from the dev proxy** — `/log` is the shell's own route, and the daemon answered
  it with its built app.
- **`$effect.pre` measuring the tag panel mid-animation** — `getBoundingClientRect` before the DOM
  update is the panel's current drawn height, which is what the retarget needs.
