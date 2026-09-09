# Review: Composer papercuts, the log's head, and the record's order

**Date**: 2026-09-09
**Status**: Resolved
**Scope**: PR #53 — `apps/ui/src/components/{log,record,routing,queue}`, `apps/ui/src/lib/{log.svelte.ts,schema-form.ts,said.ts}`, `docs/specs/shell.md`, `docs/todo.md`
**Spec**: `docs/specs/shell.md`

---

## Overall

Six todo lines closed, and five of them land. The sixth does not: `⇥` walking what
still matches is the fix the are.na item asked for, and it can only reach the second
of a set — a third channel sharing the same prefix is unreachable, cycling between the
completion and the first answer forever. The fixture has exactly two `read*` channels,
so the test that names the behaviour passes without exercising it.

Beyond that, one design gap worth deciding before it is buried: the composer now writes
a trigger tag that `releaseTriggerTag` explicitly refuses to take back, so cancelling a
template-applied route strands the tag on the item where it can never fire again — and
the comment in `fire.ts` stating why that is safe is no longer true.

`pnpm -r --silent test`, `pnpm typecheck`, `pnpm lint` all green.

---

## Bugs

### 1. `⇥` cannot walk past the second candidate

`apps/ui/src/components/routing/CandidateBrowser.svelte:227-241` — the completion
branch runs on **every** press, not only the first, so as soon as the shared prefix is
longer than what was typed the key oscillates between that prefix and the first answer.

```
typed "read" → completed = "reading" ≠ value "read"  → value = "reading"
press 2      → completed = "reading" = value          → walk → "reading-notes"
press 3      → completed = "reading" ≠ "reading-notes"→ value = "reading"   ← back to the start
```

Reproduced against three channels sharing the prefix — `["reading", "reading-notes",
"reading", "reading-notes", "reading"]` over five presses. `reading-room` is never
reachable. It looks correct in the suite because `CHANNELS`
(`ProcessingComposer.test.ts:1274`) holds only two `read*` entries, so the third press
lands on `"reading"` by the wrong path and the assertion still passes.

The spec is the shape that is wanted — "the second press takes the first answer still
matching, the third the next, and the last wraps to the first"
(`docs/specs/shell.md:733`) — so the code is what is wrong.

Fix: complete only when no walk is in progress — `if (stem === undefined) { …complete… }`
— and let every press after the first walk. Then extend `CHANNELS` with a third `read*`
channel so the test can tell the two paths apart.

### 2. A burst of activity resets an oldest-first log to page one

`apps/ui/src/components/log/Log.svelte:33` — `log.arrived` guards on
`order === "newest-first"` for exactly the reason the spec gives, but the `since.more`
branch beside it has no such guard. A reader who has walked ten pages oldest-first has
all of them thrown away and is put back at the top the moment more happens than one
watcher page holds. That is the case the newest-first rule exists to protect against,
and it is the one order where nothing has gone stale: the walk is from the oldest end,
and what arrived is past its far end.

Fix: `if (log.order !== "newest-first") return;` ahead of the branch, or move the
`more` handling into `log.arrived` so one place owns the rule.

---

## Design

### 3. A cancelled composer-applied route strands its trigger tag

`packages/core/src/pool/templates/fire.ts:145` — `releaseTriggerTag` returns early on
`record.applied?.firedByTag !== true`, and its comment says why: "a template taken in
the composer is a person's own act, and their classification is not the cancel's to
touch." As of `classify()` (`ProcessingComposer.svelte:626`) that is no longer true —
the tag on a composer-applied template is written by the shell, not by the person.

The consequence is the one the same comment spells out two lines above: tagging is
idempotent and `alreadyApplied` matches on template, so an item left carrying the tag
after its record is cancelled can never be filed by that tag again. Before this change
that state was unreachable; now every cancel of a composer-applied template produces it.

Either the shell's tag should be released with the record — which means `firedByTag`
stops being the right question and something like "notemap wrote this tag" is — or the
spec should say plainly that a cancel leaves the tag and disarms it, and the comment in
`fire.ts` should be corrected in the same change. Whichever way, the comment as it
stands is false, which `AGENTS.md` singles out as worse than none.

### 4. The tag a route puts on is allowed to fail silently

`apps/ui/src/components/routing/ProcessingComposer.svelte:628` —
`void client.tag(...).catch(() => undefined)` and the composer closes on the next line.
The whole point of the change is that "the item ends up carrying the tag whichever way
the template was reached"; where the call does not land, nothing anywhere says the
invariant broke. `ComposerTags` at least has `sayItFired` behind its own tag.

Worth one line to the corner, or a note in the spec that the tag is best-effort and the
record is the record of truth.

---

## Minor

### 5. The excerpt — the point of the change — is untested

`apps/ui/src/components/log/About.svelte` has no test, and the log test that covers it
(`log.test.ts:92`) asserts the link's name is `"0198f0c2…5e6f"` — the **fallback**,
because the stub pool never puts an item in the cache. So "the capture's own first words
are drawn in place of the id" is asserted nowhere. A test that seeds `client` with the
item and expects its first words would cover the behaviour the todo line closed on.

### 6. The watcher wiring is untested

`log.test.ts:274+` calls `log.arrived` directly, so `Log.svelte:28-38` — subscribe,
route `more` to `turn`, unsubscribe on unmount — is not exercised. This is where
finding 2 lives.

### 7. `presetOf` and `typedFrom` do not agree, though the comment says they do

`apps/ui/src/lib/schema-form.ts:80` claims the two directions agree. They do for strings
and lists of strings; `typedFrom` stringifies a number or a boolean
(`schema-form.ts:165`) while `presetOf` drops it. A destination declaring
`{ type: "integer", default: 30 }` draws an empty field, while a template that saved
`30` draws `"30"`. Either widen `presetOf` to the scalars `typedFrom` already handles,
or narrow the comment's claim to the shapes it holds for.

### 8. The narrowed log's own header still says an id

`apps/ui/src/components/log/Log.svelte:44` — "Only what is about `0198f0c2…5e6f`" sits
above rows that now say what the capture says. The same `client.held` the rows use is
available here, and this line is the one place a person has already committed to one
item, so it is the place the words are most useful.

### 9. `NO_POINTER_KEPT` reads oddly where the destination is a person

`apps/ui/src/lib/said.ts:47` — "This destination named no place to go and look" is drawn
for a marked-processed record (`Record.test.ts:176`), whose destination is the person who
did it by hand. Nothing was named because nothing was asked. A second phrase for the
`user` target, or dropping the heading there the way the empty note is now dropped, would
say the true thing.

### 10. Branch name

`todo/various-fixes` where `AGENTS.md` says `agent/<plan-file-stem>`. There is no plan
file here — the work came off `docs/todo.md` — so either the rule wants a `todo/` clause
or this is a deliberate exception worth naming.

---

## Non-issues

- **`classify` runs after the route, not before** — required, and correct: the record is
  what makes the pool absorb the tag (`packages/core/src/pool/tags.ts:67-77`). Verified.
- **`void client.tag(...)` without awaiting** — the client applies through the outbox, so
  the composer closing does not drop it. Finding 4 is about the silent `catch`, not this.
- **Presets not seeded when `applied !== undefined`** — deliberate, and it does not leak
  across a change of destination or capability: both reset `args = {}` first
  (`ProcessingComposer.svelte:584`, `:814`), and going back to the `where` list calls
  `release()`, which clears `applied`.
- **`arrived` never touches `after`** — right: newest-first, the cursor is the tail and
  the news is the head.
- **One press of a trigger tag closes the composer with no undo** — spec'd, and the
  corner carries the cancel.
- **`About` subscribing per row** — `client.held` is a `derived` over cached state and
  reads nothing, which is what the comment claims.

---

## Resolution

1. **Fixed.** `CandidateBrowser.svelte` completes on the first press alone — once `stem` is set the
   key walks. `CHANNELS` gained a third `read*` entry, and the walk test now asserts all three and
   the wrap. Confirmed it fails against the old code.
2. **Fixed.** `log.raced()` carries the `newest-first` guard `arrived` already had, and
   `Log.svelte` calls it instead of `turn`. The watcher wiring is tested rather than reached past.
3. **Fixed, and the decision reversed.** The guard in `releaseTriggerTag` no longer reads
   `firedByTag`: a reservation any template made takes that template's trigger tag with it.

   The first attempt at this was wrong and the integration suite caught it — I had claimed the
   person's-own-tag case was unreachable, and `templates.test.ts` held it: an item captured wearing
   `route/research` before any template claimed the name, then routed from the composer. On the
   developer's call that case is not one to protect — nothing routes retroactively, so a tag
   predating its template means nothing until a decision gives it one, and that decision is what
   the cancel calls off. That test now asserts the tag comes off.

   This reverses a decision [ADR 37](../adr/0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md)
   took, so it is recorded there as a superseding note beside the paragraph rather than as an edit
   over it. `core.md`, `http-v1.md` and `shell.md` amended in the same change.
4. **Won't fix — not a defect.** The premise was wrong: `client.tag` enqueues on the outbox and
   returns, so the `.catch` never sees a pool refusal in the first place. A refused tag is drawn in
   the corner by `Refusals.svelte`, like every other refused operation, and a notice from the
   composer would say it twice. The comment now says whose job it is.
5. **Fixed.** `log.test.ts` seeds the item cache and asserts the capture's own first words, that
   nothing is read to get them, and the narrowed heading.
6. **Fixed.** Two tests drive the real watcher on fake timers — news at the head, and `more`
   reading again from the top — plus the oldest-first guard from finding 2.
7. **Fixed.** `presetOf` and `typedFrom` share one `typedValue`, so a scalar default reads as the
   same string a value arriving would. `null`, `{}` and `[]` stay absent, which is tested.
8. **Fixed.** `Id.svelte` became `Says.svelte` and does the lookup itself, so the narrowed log's
   heading and the rows say the same thing and there is one rule rather than two.
9. **Fixed.** `NO_POINTER_BY_HAND` for a `user` target — done by hand, so there is nowhere to go
   and look, rather than a destination declining to name one.
10. **Won't fix.** The developer's call: keep the branch and the PR as they are, and leave
    `AGENTS.md` alone.
