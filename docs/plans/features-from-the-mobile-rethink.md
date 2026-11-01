# Features from the mobile rethink

**Date**: 2026-10-31
**Status**: In progress
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**:

---

## Goal

Four things the mobile rethink drew, built in today's shell so the redesign can carry them over:
derived note names that keep whole words and read cleanly; **save as a template** from a hand-made
routing record; a short **undo** window on every decision that makes a delivery, with `cancel`
reachable from the item and the queue; and finding items by their words on the queue and the feed.
Each phase ships and verifies on its own.

Source: the mockups' `proposal.html` ("New features drawn", "Behaviour proposal: file names",
`shots/variant-inbox-390.png`, `shots/done-390.png`) and the driver's added scope of 2026-10-31.

---

## Settled

The developer's own, not reopened here:

- **Undo is offered only while a delivery is pending.** Once a delivery has landed, nothing says
  undo. Withdrawing a delivered record ([ADR 66](../adr/0066-a-delivered-record-may-be-withdrawn.md))
  stays a separate action and is never labelled undo.
- **A short window, 3–5 seconds, on a decision that makes a delivery**: a route made by hand, and a
  template applied from the item or the process surface. Undo inside it is a true cancel of the
  pending delivery. Discard and manual make no delivery and keep `undiscard` and the manual mark's
  `undo`. The trigger tag's 15 s window is separate.
- **`cancel` on a pending delivery is reachable from where the person is**, in today's shell: the
  queue and the item, not only the status line's panel.

---

## Open decisions

Each needs an answer before its phase starts. The recommendation is the one the phases are written
against; a different answer changes the phase named.

### File names (phase 1)

**N1. The rule for a derived note name.** Today: first line, cut at 60 UTF-16 units, anything not a
letter, digit, space, `.`, `_` or `-` turned into `-`, ends trimmed
(`packages/output-markdown/src/filename.ts`, `names.ts`).

| Option | `idea: a bike rack that folds flat into the hallway wall` | `pasta from Lena's` |
|---|---|---|
| A. The proposal: lower-case, spaces to `-`, punctuation dropped, cut at a word near 40 | `idea-a-bike-rack-that-folds-flat-into.md` | `pasta-from-lenas.md` |
| B. As A, cut at a word within today's 60 | `idea-a-bike-rack-that-folds-flat-into-the-hallway-wall.md` | `pasta-from-lenas.md` |
| C. A title: case and single spaces kept, punctuation dropped, cut at a word within 60 | `idea a bike rack that folds flat into the hallway wall.md` | `pasta from Lenas.md` |
| D. A destination setting choosing A/B or C | either | either |

Every option also fixes three things the current rule gets wrong (verified with Node 26):
combining marks are not `\p{L}`, so `हिन्दी में विचार` becomes `ह-न-द- म-- व-च-र` and a decomposed
`café` becomes `cafe-`; `slice(0, 60)` can leave a lone surrogate in the name; and nothing
normalises to NFC. All options keep every script, cut on grapheme boundaries, find the word boundary
with `Intl.Segmenter` (which also segments scripts without spaces), and hard-cut a first word longer
than the budget.

Recommendation: **C**. Obsidian and Nextcloud Notes both show the file name as the note's title, so
a slug reads as a URL in the file list, the tabs and every `[[link]]`. If the vault's convention is
slugs, **B**. In both cases, argue against the 40-character cut. A shorter stem and lower-casing
make two captures more likely to derive the same name. A taken derived name is refused under
`create`. Under `create-or-append` onto a folder, it is silently **appended to the other capture's
note** (ADR 31). That collision exists today; 40 makes it more common. Lower-casing does have one
gain: the same name on case-sensitive and case-insensitive filesystems.
Depends: phase 1 throughout.
**Decided (2026-11-01):** **A**, over the recommendation, with the collision fixed rather than left: under
`create-or-append` onto a folder, a *derived* name that is taken takes the first free sibling
(`stem-1`, `stem-2`, …) instead of appending. A name the person typed still appends. The walk stops
at a note holding exactly what this delivery would write as a new note, so a retry after an
unconfirmed write does not leave a second note, as assets stop at a name already holding their
bytes. Not the frontmatter's item id: frontmatter is off by default. Amends ADR 31.

**N2. Whether the mark, surrogate and NFC fixes also reach asset names** (`oneSegment`, used by
`assetName`). Recommendation: **yes**, the fixes only, not the case or separator rule. An uploaded
Hindi file name is mangled today. Cost: an asset name with marks changes once, and a delivery
retried across the upgrade may place a second copy, which ADR 41 already allows. Depends: one task
in phase 1.
**Decided (2026-11-01):** yes, the fixes only.

### Save as a template (phase 2)

**T1. Whether a rewrite carries.** Options: carry it as a new template field; drop it and say so;
drop it silently. Recommendation: **drop it and say so** in one line on the form. A template says
where an item goes and never what words it arrives in (CONTEXT: **Routing template**,
**Rewrite**). Every item filed by it would arrive with one item's words. Carrying it would need a
model change and an ADR. Depends: one task in phase 2.
**Decided (2026-11-01):** drop it and say so.

**T2. A file name that came from this capture.** The record holds concrete arguments. A folder-only
place (`seeded/`, the name derived at delivery) carries over as it is and derives per item. A record
whose place ends in a name holds that name literally. A template saved from it files every later
item into one note (`create-or-append`) or refuses the second (`create`). Options: (a) carry
literally, the person edits; (b) strip a leaf only where it equals the name this item would have
been given (`filenameFrom`, or its `-1` free-name sibling), leaving the folder; (c) as (b), and also
turn the capture's own date in the path back into `{{captured_at}}`. Recommendation: **(b)**. It
catches the common accident without guessing at intent, and the form shows the place either way
with the pattern vocabulary under it. (c) reverses a pattern expansion, which ADR 35 keeps one-way.
Depends: phase 2's draft function.
**Decided (2026-11-01):** (b).

**T3. Where it is offered today.** Options: (a) the routing record's open block, in its foot, which
is the same component on the item, at the record's address and in the log; (b) the route's
landing notice in the status line, as its offer; (c) the process surface's head line, beside the
newest route. Recommendation: **(a) and (b)**. (a) is always there. (b) is "right after", and is
what the redesign's Routed row replaces. Both open one address:
`/settings/templates?item=<id>&record=<id>`, the form prefilled, read from
`GET /v1/items/{id}/routing`. **No new HTTP.** Offered only on a destination record made by hand
(no `applied`), not withdrawn, whose destination the shell still holds. Depends: phase 2's shell
tasks.
**Decided (2026-11-01):** (a) and (b).

### The undo window (phases 3–4)

**W1. One knob or two.** Reuse `routing.triggerWindow` for both, or add a second.
Recommendation: **two**. The trigger window covers a tag drained onto a daemon nobody may be
watching. This one covers a person looking at the screen. ADR 37's "revisit" note already expects a
shorter window. Config name to settle with the ADR (`routing.undoWindow` is a placeholder).
Depends: phase 3 config tasks.
**Decided (2026-11-01):** two. The name is settled in phase 3's ADR.

**W2. Its default, within 3–5 s.** Recommendation: **5 s**. A success notice leaves the line after
4 s. A window shorter than the time it takes to read the notice and reach `undo` makes the offer
a lie. Depends: one constant.
**Decided (2026-11-01):** 5 s.

**W3. What a window of `0` means.** Options: due at once through the job runner; or the old inline
attempt. Recommendation: **due at once**. Two delivery paths for one gesture is what ADR 37 tried
not to keep. Depends: phase 3 core tasks, and every test that routes (see Unknowns).
**Decided (2026-11-01):** due at once.

**W4. Where a destination's refusal is said, now that it arrives after the window.** Today
`422 rejected-by-destination` comes back from the route call and the composer keeps the decision
open on it. With the window, the reservation is removed when the delivery fails for good, the
item returns to the queue, and the decision the person typed is gone. Options: (a) a notice in
alarm with `open` to the process surface, as a fired template's failure is said today; (b) (a),
plus the process surface re-offering the failed decision while it is still on that item.
Recommendation: **(a)**, stated in the ADR as the cost of the window. (b) is the redesign's
Routed screen's job. Depends: phase 4.
**Decided (2026-11-01):** (a).

**W5. The client's outbox.** Recommendation: **no change**. Routing is never in the outbox. A
client out of reach cannot route. The window opens at the pool when the decision lands there, and
the client learns of the landing from the log, as it already does for a firing (ADR 32). To
confirm, not to choose.
**Decided (2026-11-01):** confirmed, no change.

**W6. Pending deliveries the shell did not make this session.** Today's in-flight list is the
session's plus what the log says. Options: (a) nothing new: `cancel` on rows and records the shell
draws; (b) a `state` on the feed's filter for items holding a pending record, read from the routing
summary's `pending` (offline too), which is what the redesign's "On its way" would read; (c) a
pool-wide `GET` of pending records. Recommendation: **(a) now, and (b) as the one HTTP addition if
the developer wants the list before the redesign**. The state's name must not be `pending` on its
own, the outbox's word (CONTEXT: **Pending**). Depends: phase 4's optional tasks.
**Decided (2026-11-01):** (a) only. (b) is left to the redesign.

### Search (phases 5–7)

**S1. The word.** CONTEXT lists *search* under **Filter**'s *Avoid*. Options: (a) no new term:
words are one more kind of **filter**, the shell says `find`; (b) the same in the domain and on the
wire, the shell *presents* it as `search`, recorded in CONTEXT as `discard` is for **archive**;
(c) **Search** as a term of its own, taken out of Filter's *Avoid*. Recommendation: **(b)**. By
the glossary's own definition it is a filter (a condition on a surface, answered by the pool, held
in the address). The mockup and every reader say "search". Wire parameter: `words` (`q` sits next
to *query*, also avoided). Depends: phase 5's CONTEXT task and every name in phases 6–7.
**Decided (2026-11-01):** (b), wire parameter `words`.

**S2. Where it runs, and what index.** Options: (a) in the pool only; (b) in the client's cache
only, which holds the working set and a capped slice of history, so it would be silently short on
the feed; (c) **in the pool, and over the cache by the same rule when the pool is out of reach**,
as a filtered surface already is (client.md, "A filtered surface"). Index options for the pool:
none (a scan); a stored folded column scanned with `instr`; SQLite FTS5 (`unicode61` or
`trigram`); `sqlite-vec` embeddings (standards.md, semantic). Verified in this repo's runtime:
`node:sqlite` (SQLite 3.53.4) is built with FTS5, and both `unicode61 remove_diacritics 2` and
`trigram case_sensitive 0 remove_diacritics 1` work. `trigram` matches nothing under three
characters. Recommendation: **(c)**, with **a folded text column per item, written by the store on
capture and amendment, scanned with `instr`**, and FTS5 `trigram` over that column added later
only if a measured page is slow. Trigram returns the same rows, so it is an optimisation and not a
change of behaviour. This respects ADR 1's amendment ("search … may not assume storage co-located
with the pool"): it stays behind the store port as a filter the store answers. Depends: phases 6–7.
**Decided (2026-11-01):** (c), a folded column scanned with `instr`, FTS5 `trigram` only if measured slow.

**S3. How words match.** Options: (a) **substring**: each whitespace-separated term must appear,
case- and diacritic-insensitive (`weep` finds *sweeper*); (b) full-text tokens with prefix
(`bike` finds *bikes*, not *motorbike*); (c) fuzzy, typo-tolerant (uFuzzy, fuse.js, fuzzysort).
Recommendation: **(a)**. The fold is one JS function both the pool and the client import, so the
online and offline answers cannot drift. ADR 35 refused two implementations of one rule. (b) needs
the client to imitate FTS5's tokenizer. (c) is a ranking and not a condition. Under ADR 14 a ranked
read needs a cursor of its own, and it means a library on both sides. `todo.md` says "fuzzy": ask
whether that meant typo-tolerant or just forgiving. Results keep the surface's own order and
position. No phrase syntax and no operators. Depends: phases 6–7. Sub-question: where the shared
function lives, since the client does not import core (a dependency-free subpath, as
`@notemap/output-markdown/naming` is for the forecast, or a small `plumbing` package).
**Decided (2026-11-01):** (a). "Fuzzy" in `todo.md` meant forgiving, not typo-tolerant. The fold lives in a new
dependency-free package, `@notemap/text` at `packages/plumbing/text`, which also holds the NFC and
grapheme helpers phase 1 needs, so `output-markdown` and the search fold share one normalisation.

**S4. Scope.** Options: surfaces (queue, feed, archive on the wire; the log; settings lists) ×
fields (the capture's words, attachment names, tags, unfurl titles, routing places, rewrites,
outputs). Recommendation: **the queue and the feed (and `/v1/archived` on the wire, which takes
what the queue takes), matching the capture's words and its attachments' names**. Tags already
have a filter. Places and outputs are a question about records, not items. The log's filter is
kinds or one item, and words there is a later change. Unfurls are the daemon's and not pool state
(ADR 51). Depends: phases 6–7.
**Decided (2026-11-01):** as recommended.

---

## Tasks

### Phase 0: before anything

- [x] Work on `agent/features-from-the-mobile-rethink` (exists, from `main`).
- [x] Answers to the open decisions recorded above, each struck to the chosen option.

### Phase 1: derived note names

Depends on N1, N2. Nothing else.

- [x] ADR via `core:adr`: what a derived note name is, slug against title, the 40 cut, every script
      kept, and a taken derived name taking its free sibling rather than appending. Amends ADR 31.
- [x] `@notemap/text` at `packages/plumbing/text`: NFC, grapheme-safe cut, word boundary by
      `Intl.Segmenter`. Dependency-free, tests beside it. Phase 6 adds the fold to it.
- [x] `filename.ts` takes the rule (N1 A) through `@notemap/text`. `oneSegment` gains the mark,
      grapheme and NFC fixes (N2).
- [x] Both adapters: a folder-only `create-or-append` whose derived name is taken walks
      `stem-1`, `stem-2`, … to the first free name, stopping at a note holding exactly what this
      delivery would write as a new note. A typed leaf still appends. Adapter tests: taken derived name, retry after an
      unconfirmed write, typed name appends.
- [x] The composer's forecast: a folder-only place whose derived name is taken forecasts `create`
      under the free sibling, not `append`. shell.md's forecast lines to match.
- [x] `filename.test.ts` beside it. There is none today; the derivation is tested only through the
      adapters. Cases: both mockup examples, `# heading`, a URL-only line, Devanagari, NFD
      `café`, CJK with no spaces, an astral letter at the cut, a first word past the budget, an
      empty capture (item id), a rewrite's first line.
- [x] Adapter and integration tests that assert a derived name: update the expected names
      (`destination-fs`, `destination-webdav`, `tests/integration`, `tests/full-stack`,
      `apps/ui/src/lib/forecast.test.ts`).
- [x] Docs: `packages/output-markdown/README.md`, `packages/adapters/destination-fs/README.md`
      ("weak, and knowingly"), and core.md's 2026-08-13 open question, noted as narrowed. Nothing
      ADR 31 gets its amendment note. core.md's routing section, if it says what a taken derived
      name does.
- [ ] Verify: typecheck, `pnpm -r --no-sort --silent test`, lint. Stage the branch and route a
      capture to a folder on the filesystem kind and on WebDAV. Commit.

### Phase 2: save as a template

Depends on T1–T3. Independent of phase 1: the leaf check (T2) calls `filenameFrom`, whichever rule
it holds. If phase 3 lands first, (b)'s offer goes on the landing notice, not the route's.

- [x] `$lib/template-draft.ts`: a record (and its item) to a `RoutingTemplateDraft`. Destination,
      capability, arguments including `folder`, `conversion`, `heading` and settings overrides;
      the leaf dropped per T2; no name, no trigger tag, nothing asked; whether a rewrite was left
      behind. `undefined` for a record it does not offer on. Tests beside it. This is the part the
      redesign carries over.
- [x] `TemplateForm` takes a starting draft distinct from `editing`. Saving creates; the caret is
      in the name, as it is now. A rewrite left behind is said in one line under the place.
- [x] Settings › Templates reads `item` and `record` from the address, reads the item's records,
      and opens the form prefilled at the top. A record it cannot find is said plainly, and the
      section draws as usual.
- [x] `save as template` in the open record block's foot (`record/Block.svelte`), on the T3 terms.
- [x] The route's notice offers `save as template` where nothing else is offered.
- [x] shell.md: the block's foot, the notice's offer, the Templates section opened from a record.
      No change to core, http-v1, client or CONTEXT.
- [x] Component tests: offered and not offered (template-made, manual, withdrawn, destination
      gone), the prefill, a rewrite said, a derived leaf dropped and a typed one kept.
- [x] Verify, commit.

### Phase 3: the undo window, in the pool

Depends on W1–W3, W5. Independent of phases 1–2.

- [x] ADR via `core:adr`, written with the developer, amending ADR 37 and touching ADR 17: a
      decision that makes a delivery waits a short window before its first attempt, whether made by
      hand or by applying a template from the composer. The reasoning: ADR 37 kept hand routes
      inline because the composer *is* the review: "paying for it everywhere would make every
      hand-made route slower to serve a mistake that surface does not make". The redesign makes
      one-tap template routes from the item and moves straight to the next item, so that review is
      gone. Name the costs: no pointer from the call (the shell draws a pending record first), a
      destination's refusal arrives after the window (W4), and tests can no longer read a delivery
      off the route call.
- [x] CONTEXT.md, for the developer to confirm: **undo** is the shell's word for cancelling the
      decision just made, offered only while its delivery is pending; **cancel** is the same call
      on any pending reservation; **withdraw** is for a delivered record and never undo. Amend
      **Withdraw** and **Delivery** to match. Name the window as the ADR does.
- [x] Core: `route` no longer attempts inline for a destination target. It checks what it checks
      today (`prepare`), writes the reservation and enqueues the delivery job with `notBefore` =
      decision time + the window, as `fire` does. A mark by hand is unchanged. `PoolConfig` gains
      the window.
- [x] The action log: a decision held in its window writes an entry carrying `until`, as
      `template-fired` does, so a shell counts down to a fact. The kind is new or `routed` is
      split, settled in the ADR. `delivery-failed` attempt numbering starts at the job's first
      attempt.
- [x] HTTP: `POST /v1/items/{id}/route` answers `200` with a `pending` record and `until`. It no
      longer answers `422 rejected-by-destination`. Checkable refusals stay. OpenAPI and client
      types regenerated.
- [x] Daemon config: the knob, its default, `config.example.toml`, `docs/running.md`.
- [x] Specs: core.md (Routing: no inline attempt; the window), http-v1.md (the route section's
      "blocks for one delivery attempt" and the 422 go; `until`), client.md (a route's record is
      pending, landing is read from the log as for a firing).
- [x] Tests: a hand route is pending and lands after the window; cancel inside the window removes
      it and returns the item; cancel after landing is `409 not-pending`; window `0` is due at
      once; a refusal after the window removes the reservation and returns the item. Update every
      test that read a delivery off the route call (see Unknowns).
- [x] Verify: typecheck, tests, lint, `pnpm test:stack` (crosses HTTP and config). Commit.

### Phase 4: undo and cancel, in the shell

Depends on phase 3 and W4, W6.

- [ ] A hand route and a template taken in the composer become a **route in flight** on the
      status line, as a firing is: the name, the seconds left, `undo` while the window is open and
      `cancel` once it has closed and the delivery is still pending. `saidOf` stops saying
      `retrying` for a record that has simply not been tried yet.
- [ ] The process surface: after a route, the head's "where the item has gone already" line draws
      the pending record with `undo`, and then what it landed as.
- [ ] The queue's held row and the feed row: a routing line for a pending record carries `cancel`.
      The record id comes from the route's answer, or from reading the item's routing on the
      press. No wire change.
- [ ] The item's record row keeps `cancel` (exists). A delivered record offers `withdraw` and never
      `undo`.
- [ ] A refusal after the window is said per W4.
- [ ] Optional, per W6 (b): the feed filter's new state on the wire, in core and in the client's
      rule, and a band entry in the filter panel. http-v1.md, core.md, client.md.
- [ ] shell.md: the status line's route in flight (hand routes too, `undo` against `cancel`), the
      process surface after route, the row's routing line, the notice words.
- [ ] Component tests beside each. Verify, `pnpm test:stack`, commit.

### Phase 5: search, decided and recorded

Depends on S1–S4. No code.

- [ ] ADR via `core:adr`: a filter may name words. It covers the folded substring rule, one shared
      function, the surface's own order and position (ADR 14 untouched), the store answering
      behind its port (ADR 1's amendment), and the index left as a measured optimisation. It names
      fuzzy and ranked search as rejected for now, with why.
- [ ] CONTEXT.md: **Filter** gains words. Its *Avoid* line says how the shell presents it (S1).
- [ ] Commit.

### Phase 6: search, the pool and the wire

Depends on phase 5.

- [ ] The shared fold and match, in `@notemap/text`: NFC, case fold, marks stripped, whitespace collapsed; terms split
      on whitespace; every term a substring. Tests with every script phase 1 tests.
- [ ] Core: `SurfaceFilter` gains branded `words`, made only by a tidy function (as `tagFilter`):
      trimmed, folded, blank dropped, a length bound refused.
- [ ] store-sqlite: a migration adds the folded column (or a side table), written on capture, on
      amendment and on a revision. Backfilled. Read as one `instr` clause per term, alongside the
      existing filter clauses. Not mirrored; it is derived.
- [ ] HTTP: `words` on `/v1/feed`, `/v1/queue`, `/v1/archived`. `next` carries it. Refusals in
      `errors/refusals.ts`. OpenAPI and client types.
- [ ] Measure: seed 20 000 items, time a filtered page. Over 50 ms, add FTS5 `trigram` over the
      column and show the same rows come back.
- [ ] Specs: core.md (the queue: the filter takes words), http-v1.md (the three routes).
- [ ] Integration tests: each script, a term in an attachment name, words with tags and states,
      paging under words, an amendment re-matched. Verify, `pnpm test:stack`, commit.

### Phase 7: search, the client and the shell

Depends on phase 6.

- [ ] Client: the filter tidies `words` as the pool does. The one rule keeping a page includes the
      shared match, so a cache-drawn surface and an arrival agree with the pool. client.md.
- [ ] Shell: a line in the list head of the queue and the feed, beside `order` and `filter ▾`,
      published as a command with a binding (`/` is free), on the address as `words=`. While
      typing it replaces the address; once settled it pushes one entry, so back takes the words off
      as it takes a tag. Never remembered. An emptied list says `Nothing matches “bike rack”.` with
      `clear filters`. Not counted in `filter N ▾`. This line is what the redesign's search field
      becomes.
- [ ] shell.md: "Tags, and a filter" gains the words line. Component and command tests. Verify,
      commit.

### Phase 8: close

- [ ] `todo.md`: tick "fuzzy search…" with what shipped and what did not (fuzzy, the log). Leave
      "searchable files/folders in webdav/fs destinations" alone, since it is a different
      question.
- [ ] Shipped entries in every spec listed, status, open the PR.

---

## Unknowns

- **How many tests read a delivery off the route call.** 27 test files route, and 74 assertions
  expect `delivered`. Fallback: one helper that routes and runs the due jobs, with the window at
  `0` in the integration and full-stack fixtures, as `trigger.test.ts` already sets
  `triggerWindow`. If it is larger than that, phase 3 splits into core-and-wire and tests.
- **A backfill computed in JS.** Migrations are SQL strings run by `migrate`. Folding in JS means
  either a function registered on the connection before migrating (`node:sqlite` has
  `DatabaseSync.function`) or a pass after it. Fallback: the pass, made idempotent by a null
  column.
- **Nextcloud's forbidden names.** Newer releases can refuse Windows device names (`con`, `nul`,
  `com1`) as base names. Not verified here. If a derived `con.md` is refused, it is a refusal
  today as well. Phase 1 adds a test and a suffix only if staging shows it.
- **`Intl.Segmenter` in the shell's browsers.** Present in every current engine. If one lacks it,
  the forecast falls back to the hard cut and differs from the daemon for that one name.
- **A pending reservation across the upgrade** lands under the new derived name. A delivery retried
  after an unconfirmed attempt may then write a second file under the other name (ADR 41).
  Accepted, not handled.

---

## Not in this plan

Fuzzy or ranked search; search in the log, settings or destinations' files; matching places or
outputs; marking matched words in a row; a pool-wide "on its way" list beyond W6 (b); the redesign
itself.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what
was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed
and linking back to this plan. No implementation details, no granular tasks. A plan marked Done
whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
