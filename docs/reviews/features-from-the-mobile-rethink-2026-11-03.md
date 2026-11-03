# Review: Features from the mobile rethink (PR #126)

**Date**: 2026-11-03
**Status**: Resolved
**Scope**: `git diff main...HEAD` on `agent/features-from-the-mobile-rethink` (phases 1–8)
**Plan**: `docs/plans/features-from-the-mobile-rethink.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`

---

## Overall

The phases do what the plan says. Typecheck and `pnpm -r --no-sort --silent test` are green. The
core change in phase 3 is small and correct, and the search fold agrees between the store and the
client. The most important finding is outside the code: **the PR conflicts with `main`**. #125
(batch routing) landed after this branch was cut, and the two touch 16 of the same files, the
SQLite migration list among them (4). Of the developer's three notes:

- Note 1 is older than this branch.
- Note 2 is a real defect. The `cancel` it shows is an offer that cannot work.
- Note 3 is one constant, not two delays added together.

The same-bytes retry guard is acceptable for the same item routed twice, but ADR 67 overstates
it (7).

---

## The developer's notes

### 1. A template saved without a name says "the app sent a capture this daemon cannot read"

The message comes from the client, not from the daemon.

```
TemplateForm.save sends name: ""            apps/ui/src/components/settings/TemplateForm.svelte:256
→ zod name: z.string().min(1) fails         apps/daemon/src/schemas/template.ts:65
→ readBody answers 400 malformed-envelope,  apps/daemon/src/utils/body.ts:35
  carrying issues [{ path: "/name", keyword: "minLength" }]
→ readRefusal reads it with a fixed string  packages/client/src/errors.ts:130
  "the app sent a capture this daemon cannot read", and drops `issues`
```

So the error has two faults. It names a *capture* on every route that uses `readBody`
(templates, destinations, accounts, settings…). It also throws away the field the daemon already
named. The form lets the request through because `save` is gated only on `disabled={!pool.yes}`
(`TemplateForm.svelte:505`), and nothing checks a blank name.

**Before this branch?** Yes. The string dates from #13 (2026-08-17), and the form's `save` is
unchanged. Phase 2 makes it easier to hit: the prefilled form is complete apart from the name, the
caret sits in the name, and `save` looks ready to press.

**The trigger tag half, a question.** From the code I cannot reproduce it. A blank trigger tag is
left out of the request (`TemplateForm.svelte` `tag.trim() === "" ? undefined`), and an absent
`triggerTag` is valid. A blank *required argument* gives `422 arguments-invalid`, "that
destination needs different arguments", which is a different message. A repro would settle it.
The answer could be a whitespace-only name, or a field that is not the trigger tag.

**Proposed fix**, in two layers. Both are needed.

- At the control: `save` stays disabled while `name.trim()` is empty, and the form says
  `a template needs a name` under the field, as a refusal at a control still on screen is said
  (shell.md, "A failure at a control that is still on screen is said at the control"). Doc:
  shell.md's Templates section, one line.
- In the client: `malformed-envelope` reads `issues`. Say "the app sent something this daemon
  cannot read: `name` is required" from the first issue's `path` and `keyword`, and drop "capture"
  from the sentence. Better still, give the daemon a refusal of its own for a blank template name,
  so the sentence is a person's sentence. A daemon refusal changes http-v1's refusal table and
  `refusals.ts`. Pick one. The first needs no doc beyond client.md's refusal reading. The second
  needs http-v1 and an `errors.ts` entry.

### 2. `undo`, then briefly `cancel`, after a route from the process surface

By the spec's own words this is designed: `undo` inside the window, `cancel` after it while the
delivery is pending (shell.md "A route made by hand is in flight too"; `Firing.svelte:43`,
`Panel.svelte:150`, `Process.svelte:1113`). In practice the `cancel` it shows cannot succeed.

```
t = until (daemon clock)  runner's wake timer claims the job, leasing it (runner.ts wake → tick)
                          the fs delivery lands in milliseconds
t = until (browser clock) firings.now ticks past until → Firing/Panel/Process flip to "cancel"
                          (left() is undefined once the window closes; firings.svelte.ts)
t = until + 500 ms        first LOOKS_AFTER ask (firings.svelte.ts:26) reads the log
                          → `routed` landing → firings.closed(record) → status line clears
t = later                 Process: the client hears the landing → summary.pending changes
                          → `routed` key changes → records.reread() → takeable is undefined
```

`cancel` shows for at least 500 ms on every route, and longer in Process, which waits for a
second read. During that time the job is either leased (`cancelDelivery` refuses
`delivery-in-flight`) or already delivered (`not-pending`). Either way `cancelRouting`'s `.catch`
(`apps/ui/src/lib/firing.ts:41`) turns it into "could not cancel" and drops the reason. That breaks
shell.md's own rule from 2026-10-01: "An `undo` is only offered while it would work."

Two more ways to see it:

- **Pressing `undo` late in the window.** The 1-second tick can flip the label to `cancel` while the
  cancel request is still in flight. If the request reaches the pool after the daemon's `until`,
  it is refused although the button said `undo` when it was pressed.
- **Clock skew.** `until` is the daemon's clock, and the comparison uses the browser's. On a stage
  reached from another host, the flip moves by however far apart the two clocks are.

There is also a doc conflict underneath. CONTEXT **Undo** says it is offered "within the undo
window *and until it lands*" (CONTEXT.md:512–513). shell.md and the code say `undo` inside the
window and `cancel` after it.

**Proposed fix.**

- After the window, offer nothing: the asking mark alone, as `Firing.svelte` already draws.
- Offer `cancel` only once the log says the delivery is `retrying`. That is a `delivery-failed`
  with code `unreachable`, which `firingOf` already recognises (`retried`) and keeps open.
- Give `Firing` a `retrying` flag, set by `firingOf` on that entry.
- Have Process read the firing from `firings.open` for its record instead of comparing its own
  clock, so the status line and the head always say the same word.

This also covers a fired trigger tag. That is a change to the 2026-09-30 paragraph ("`cancel`
stays, since a pending record can be called off until it resolves") and to the 2026-11-01 one.
CONTEXT **Undo** loses "and until it lands", and **Cancel** gains "while the pool is retrying it".

Optionally, flip the shell's label a few hundred ms before `until`, to absorb the press-to-pool
delay and some skew.

Tests: a Process test that advances past `until` and asserts no `cancel`, then no button once the
records read delivered. A `firingOf` test that a retried failure sets the flag.

### 3. Trigger-tag routing, 15 s → 10 s

**15 s is one constant, not two delays added together.** A route made by hand, a template taken in
the composer included, waits `undoWindow` (5 s). A trigger tag waits `triggerWindow` (15 s,
`fire.ts:95`). Nothing adds the two. The shell's looks at +0.5/2/5 s after `until` add up to a
second before the landing is *said*. The runner claims on time, because it wakes on
`template-fired`.

Where 15 s is stated:

- `apps/daemon/src/constants.ts:80`: `DEFAULT_TRIGGER_WINDOW_MS = 15_000`. Its comment ("comfortably
  more than the delivery runner's own poll") still holds at 10 s against `DEFAULT_DELIVERY.pollMs =
  5_000`, and the wake on `template-fired` makes it moot anyway.
- `apps/daemon/config.example.toml:84`: `triggerWindow = 15000`. The config key is
  `routing.triggerWindow` (`config/load.ts:153`, `:498`).
- `docs/adr/0068-…:101`: "fifteen seconds is long when a person is watching". This is reasoning as
  it stood on that date. Leave it, or add a dated line.
- `docs/plans/features-from-the-mobile-rethink.md`, Settled: "The trigger tag's 15 s window is
  separate." The plan is Done and historical. Leave it.
- Test fixtures pin their own value and need not move: `apps/daemon/src/testing/fixture.ts:49`,
  `tests/integration/src/fixture.ts:97` with its comment at `templates.test.ts:33` ("fifteen seconds
  wide"), `StatusLine.test.ts:724` (`"15s"`, from the test's own `until`), and
  `firings.svelte.test.ts:83`.
- No spec, standard, CONTEXT entry or `docs/running.md` states the number. `running.md` defers to
  `config.example.toml`. The stage's `.claude/stage/config.toml` sets no `[routing]`, so it runs the
  default.

ADR 37's revisit note already foresees this ("Revisit if the window is felt as lateness … a
shorter window"), so it is a change of default, not a new decision. A dated line under core.md's
fired-template bullet, or in ADR 37's revisit, would record it.

The scope matters. #125's batch routing files through trigger tags, so the default also sets how
long a batch waits. If only the stage should be faster, set `[routing] triggerWindow = 10000` in
`.claude/stage/config.toml` instead (read from `main`).

---

## Bugs

### 4. The PR conflicts with `main`, the migration list among the conflicts

`gh pr view 126` reports `CONFLICTING`. #125 (`56d3b62d`, batch routing) landed after the merge
base `0443c836`. `git merge-tree` conflicts in 16 files. These matter beyond text:

- `packages/adapters/store-sqlite/src/migrations.ts`: main appended two migrations (`actions.batch`,
  `routing_records.batch`) at the index this branch's `words` migration took. The words migration
  must go *after* them. A database migrated by the branch or by main would otherwise skip one of
  the two. The test's `BEFORE_WORDS = MIGRATIONS.length - 1` (`migrations.test.ts`) holds only if
  it stays last.
- `packages/core/src/pool/routing/route.ts`: main's `cancelDelivery` now answers the `Item`.
  Resolve onto this branch's `route`.
- `apps/ui/src/lib/action-log.ts`: main added `endingOf`, which counts *any* `routed` entry as an
  ending (`ENDS`, `!retried`). After the merge it must also skip `decided(...)`, or a decision
  entry reads as a landing to the batch tallies.
- `Firing.svelte`, `StatusLine.svelte`, `firing.ts`, `Queue.svelte`, `Feed.svelte`, `bindings.ts`,
  and four specs.

Fix: rebase onto `main` (no force-push once the PR has reviews, per AGENTS.md, so merge `main`
in), put the words migration last, teach `endingOf` about `until`, re-run typecheck, the tests and
`pnpm test:stack`.

### 5. Undoing a template taken in the composer can be re-done by its own trigger tag

`apps/ui/src/components/process/Process.svelte:870–888`. After a route from a template, `classify`
puts the template's trigger tag on the item **through the outbox**. `undo` is a direct call.

```
route (template T) → record R pending; client.tag(item, T.tag) queued in the outbox
undo pressed       → POST /routing/R/cancel lands first → R removed
outbox drains      → tag arrives; alreadyApplied(item, T) finds nothing (core tags.ts)
                   → T fires → a new reservation, delivered after the trigger window
```

Before this branch a hand route was delivered inline and was never cancellable, so this ordering
could not arise. The window is narrow when online and wide when the outbox is backed up. If the
tag lands first it is absorbed, and `releaseTriggerTag` takes it off on cancel, which is correct.

Fix, a question for the developer: either `classify` waits until the delivery lands (tag on the
landing, not the decision), or `takeBack` drops a still-queued tag operation for that item and tag
before cancelling. The first is simpler and matches "the tag says what it says everywhere". It
changes the shell.md sentence about the tag going "the moment it is routed". Add a test for it
either way.

### 6. `/log` draws a decision as a landing

`apps/ui/src/components/log/LogRow.svelte:93` builds the closed row's record with
`state: kind === "delivery-failed" ? "pending" : "delivered"`. A `routed` entry carrying `until`
is the decision, so every hand route now shows as two `routed` rows in the log, and the first
reads as delivered with no pointer. ADR 68 and shell.md say a `routed` entry with `until` "is a
decision, not a landing". `action-log.ts` honours that and the log surface does not. Fix: read
`until` there, giving `state: "pending"` and a word of its own (or `routing`) in `kindWord`, with a
LogRow test. shell.md's log section could say how a decision entry reads.

### 7. The same-bytes guard is not only "its own earlier attempt"

The fs walk is `destination-fs/src/destination.ts:498–531`, and the WebDAV one is
`destination-webdav/src/notes.ts:115–157`. Both stop at a note "holding exactly what this delivery
writes as a new note", and their comments, like ADR 67:72, say this "can only be its own earlier
attempt". That is false in two cases:

- **The same item routed twice to one folder** (the known case). The second delivery renders the
  same bytes, finds the first's note, and lands on it without writing. Two records then point at
  one note. **I judge this acceptable**, and better than before, when ADR 31 appended a second copy
  of the same words into the note. Each record stays true: the note holds that item's words.
  Withdrawing one leaves the other standing, which is right.
- **Two different items whose notes render identically.** Frontmatter is `none` by default, so two
  captures that both say `milk`, with the same hashtags, give the same bytes. The second lands on
  the first's note and writes nothing. This contradicts ADR 67's own "Good — Two captures that
  begin alike make two notes", and is the silent merge ADR 67 set out to end, only rarer.

Fix options. (a) Accept it, and say so in ADR 67's consequences, both READMEs ("weak, and
knowingly") and the two comments, dropping "can only be". (b) Honour the guard only on a retry: on
attempt 0 there is no earlier attempt of its own to find. That needs the attempt number, or a
`retry` flag, on `Delivery`, a core type change worth a line in core.md. (b) also handles the same
item routed twice, which then gets a `-1`. I lean to (b), but it is the developer's call.

### 8. Search can rewrite the next page's address

`apps/ui/src/components/tags/Search.svelte:37–43`. The 250 ms `waiting` timer is never cleared
when the component is destroyed. Type, then open an item or switch surface within 250 ms, and
`reading.search` runs `withWords(page.url, …)` against the *new* page and pushes `?words=…` onto
it. Fix: clear the timer in an `$effect` teardown (or `onDestroy`), with a test that unmounts
mid-settle.

---

## Design

### 9. Process keeps its own clock for the undo/cancel word

`Process.svelte:1113` compares `firings.now` with `record.until` itself. `Firing.svelte` and
`Panel.svelte` use `left()`. They agree today only because both read `firings.now`. That value
stops updating once no firing is open: `tick()` clears the interval without refreshing `now`. So
after the status line closes the firing, Process's label is frozen at the last tick. This is part
of note 2's fix: read the firing from `firings.open`, not the clock.

### 10. Two `routed` entries per hand route is a contract every reader must learn

ADR 68 chose `routed` plus `until` over a new kind. Every reader of `routed` must now check
`until`: `action-log.ts` does, `LogRow` does not (6), and main's `endingOf` will not (4). The
daemon's `heard` hook (`apps/daemon/src/main.ts:97–100`) wakes the runner on every `routed`,
landings and manual marks included. That is harmless but shows the same blur. Not a request to
reverse ADR 68. But if a third reader turns up missing the check, a `route-decided` kind would end
the class of bug. A question for the developer.

---

## Minor

### 11. Docs left saying the old thing

- `docs/specs/shell.md:2444–2448`: "a pending record is one whose delivery was attempted and did
  not go … reads as **retrying**". A pending record is now usually just inside its window. Amend it
  with a dated note.
- `CONTEXT.md:669`, **Status line**: "what is in flight — a route a trigger tag made". Hand routes
  are in flight too.
- `CONTEXT.md:512–513`, **Undo** "until it lands", against shell.md (see note 2).
- `docs/adr/0067-…:73`: "lands there without writing again". On the filesystem it rewrites the
  same bytes through `replaceFile` (`expects` is the snapshot) and places the assets again. Either
  skip the write when `existing.text === file`, or reword the ADR.
- `docs/specs/core.md:1162–1166`: "Core imposes no timeout on describing the destination … *Retired
  2026-11-01*". It reads as both current and retired. Split the retired part from the standing
  rule.

### 12. `MAX_WORDS`'s comment is not what the code enforces

`packages/core/src/pool/filter.ts:23`: "In characters, as typed." `words.length` counts UTF-16
units, and the pool never sees what was typed. The client sends its folded, de-duplicated terms
(`surfaces/reads.ts`, `words.join(" ")`). The client applies no bound, so 300 typed characters are
refused online (`words-too-long`) and matched offline, unless folding brought them under 200.
Either bound the client's `filterOf` the same way, or make the comment and http-v1 say "of the
`words` parameter". AGENTS.md: a comment claiming a guarantee must be one the code enforces.

### 13. Two doc comments detached by an insertion

- `packages/core/src/types/domain/routing.ts:146`: `/** What a delivery that landed adds … */`
  now sits above `RoutedRecord`'s comment, not above `DeliveryLanding`.
- `packages/adapters/store-sqlite/src/migrations.ts:1–25`: `MIGRATIONS`' comment (timestamps sort
  half a second apart) now sits above `WORDS`.

### 14. Tests missing for behaviour that changed

- `config/load.ts`: no test that `routing.undoWindow` defaults to 5000 and is read when given.
- Process: no test that the button leaves once the record lands. The window's close is note 2.
- core.md:1186 claims "An edit arriving inside the window amends … the delivery carries the edited
  words". Nothing tests that for a hand route.
- LogRow for a decision entry (6). The cancel and tag race (5). WebDAV has no "passes over a folder
  holding the derived name" test, which fs has.

### 15. "could not cancel" drops the pool's reason

`apps/ui/src/lib/firing.ts:41` swallows the `Refused`, so `delivery-in-flight` and `not-pending`
both say "could not cancel". This was already so on main, but `undo` now makes it the common path.
`saidBy(error)` would say which.

---

## Questions

- **Does the fold have a version?** The `words` column stores `fold` as it was when each row was
  written. A later change to `fold` makes the pool and the client disagree until something
  re-folds, and nothing ties the two. A sentence in ADR 69 ("a change to the fold re-folds in a
  migration") or a pinned test of `fold`'s output would hold the line.
- **Note 1's trigger tag half**: see note 1.
- **Clock skew**: `until` is the daemon's clock and the countdown runs on the browser's. Is a
  stage reached from another host where note 2 was seen? It would make the flip earlier or later.

---

## Non-issues

- **The Shipped trail**: core.md, http-v1.md, client.md and shell.md each carry dated 2026-11-01
  entries for the work, and the plan is Done.
- **The store and the client agree on words.** The SQL `json_tree(...) WHERE type = 'text'` and
  `stringsIn` both take every string *value* (no keys, no numbers) of the content. Attachment
  filenames come from the same `item_assets` the wire `assets` lists. Both join with `\n` and fold
  through the one `fold`, which collapses whitespace, so order does not matter and no term can span
  a separator. `instr` and `includes` are the same substring test.
- **`refold` coverage**: `insertItem` covers capture, revision and rebuild from the mirror. `amend`
  re-folds after replacing the attachment references. Purge removes the row. Asset filenames are
  immutable.
- **`notemap_fold` registered on the writer only**: reads use `instr` against the stored column
  and never call it.
- **The undo window equal to the delivery poll (5 s each)**: the `heard` wake after commit sees
  slightly under 5000 ms and sets a timer. Every pass after that re-arms through `wake(looked)`.
- **`route` no longer re-checks the destination inside the transaction**: a destination removed
  inside the window fails the job and returns the item, the same as a fired template.
- **`delivery-failed` with `rejected-by-destination` / `delivery-outcome-unknown` codes**: these
  are still failure codes on the log. Only their place as answers of the route call went.
- **Typecheck and unit/integration tests**: green on this branch as of this review. `test:stack`
  not run here.

---

## Resolution

The branch was rebased onto `main` after this review. Main had taken ADR 67, so the ADRs named
67–69 above are now 68 (note names), 69 (undo window) and 70 (search) (`c1583a71`).

1. **Fixed.** `save` is disabled while the name is blank, and the field says "a template needs a
   name". The client names the field a `malformed-envelope` reports (`4d8ff226`). A blank trigger tag
   is no tag and saves without one, which is valid, so it gets no message.
2. **Fixed.** After the window a route in flight offers nothing, and `cancel` only once the log says
   the pool is retrying it (`b8cad645`). The record row and the record block follow the same rule,
   read from the same route in flight (`892b5590`).
3. **Fixed.** `DEFAULT_TRIGGER_WINDOW_MS` and `config.example.toml` are 10 000, with a dated line in
   core.md (`b8096dd7`).
4. **Fixed.** Rebased onto `main`: the words migration is last, and `endingOf` skips the decision
   entry. The decision entry later became its own kind (10).
5. **Fixed.** The client can recall an unsent tag, and waits for one already being sent. An undo
   recalls the trigger tag before calling the route off (`eaf51133`).
6. **Fixed.** `/log` draws no row for `delivery-held`, so a hand route is one row (`a2c88c4b`).
   `template-fired` still draws its own row, as shell.md states.
7. **Fixed.** `Delivery.attempt` counts from 1. Both file kinds land on matching bytes only on a
   retry, and WebDAV now passes over a collection with the derived name (`f43ae7c3`).
8. **Fixed.** Search clears its timer when it is destroyed (`496ada43`).
9. **Fixed.** Process reads its offer from the route in flight (`b8cad645`).
10. **Fixed.** The decision is `delivery-held`, and `routed` is only ever the landing. ADR 69 records
    why (`a2c88c4b`).
11. **Fixed.** The stale docs: shell.md and CONTEXT (`b2ea49f1`), ADR 68's wording (`f43ae7c3`),
    CONTEXT's Undo (`b8cad645`).
12. **Fixed.** `MAX_WORDS` lives in `@notemap/text` and is counted as UTF-16 units of the parameter.
    The client refuses the same before asking the pool (`b0ec10aa`).
13. **Fixed.** Both comments are back above what they describe (`775b5a08`).
14. **Fixed.** Tests for the config windows (`b8096dd7`), an edit inside the window (`662b4c4d`), the
    Process offer leaving on landing (`b8cad645`), the tag race (`eaf51133`) and WebDAV's folder
    (`f43ae7c3`). The `/log` row test came with 6.
15. **Fixed.** "could not cancel" gives the pool's reason (`6fce556a`).

Questions: whether the fold has a version stays open, with no change made. Clock skew is unchanged;
the new rule offers nothing at the window's edge, which takes the sting out of it.
