# A routing composer you can type

**Date**: 2026-09-01
**Status**: Done <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**: 2026-09-02

---

## Goal

> Routing a capture into a vault is one line you type. A destination is taken by typing its name;
> the line then holds nothing but the place, completed from what the destination offers and what
> you have routed to before. The hierarchy is drawn beside it rather than walked through, a folder
> that is not there is made, and whether the item creates a file or is appended to one is not a
> question anybody is asked — it is decided at delivery, when the answer is true, and said in one
> word before you commit.

## The design

**[`docs/design/composer.html`](../design/composer.html) is what this plan builds**, with
`docs/design/shots/composer-1440.png` and `composer-390.png` beside it. Open the file directly —
`file://` works, there is nothing to serve, no build and no account. It carries every state named
below: `where`, `create`, `append`, `remembered`, `gone`, `unreachable`, and the whole thing at
390. Where this plan's prose and that page disagree, **the page wins** — it is the thing an
implementation is compared against, on the terms
[docs/design/README.md](../design/README.md) already sets.

A mockup, not a component: no state, no interaction, no data, and a class there is a suggestion
about structure rather than one to copy into a Svelte file. What must survive is the system — one
line, the hierarchy shown rather than walked, a state as an inverted word, red for an action and
nothing else.

Drawn 2026-09-01 in the Claude Design project *notemap shell — first iteration* over three rounds,
which holds the options that were rejected and why. `docs/design/` is the export and the reference;
the project is the history.

---

**This plan lands after [destination-webdav](destination-webdav.md) has merged**, and depends on
it: phase 1 adds a capability that both kinds implement, and there is no sense implementing it
against one.

---

## What the current composer costs

Verified 2026-09-01 against `apps/ui/src/components/routing/`.

`CandidateBrowser.svelte` keeps a `history` stack and draws only its last element: one `back`
button, no trail, no way up two levels, no filter. Reaching `projects/notemap/notes` is four
clicks, each repainting a flat list. Beside it sits a free-text `input` holding the same value, so
one value has two controls that cannot see each other. `create-file` then does this twice —
`directory` and `filename` are separate `Group`s — and `RoutingComposer.svelte` stacks all of it
under `where` and `do` in a 30rem modal.

## What the port already answers

`filesystemCandidates` (`packages/adapters/destination-fs/src/candidates.ts`) answers
`append-to-file`/`path` with **folders and files together**: a folder as `{ label, scope }`, a file
as `{ label, value }`. So one call per level along the typed path draws the tree *and* says whether
the leaf is there. `CandidateEntry` does not change.

The cost is that the composer's filesystem mode knows a capability and field by name — kind-specific
knowledge, which is what `browserFor` (`apps/ui/src/lib/candidate-browsers.ts`) is a seam for. It
stops being empty.

## Decisions taken, and what they cost

Settled with the developer 2026-09-01/02.

- **The third capability is `create-or-append-file`.** Long, and nothing shorter was unambiguous:
  `write-to-file` and `put-file` both promise an overwrite that never happens, and `add-to-file`
  faintly implies the file is already there. It will mostly be written in rules, where the length
  reads fine.
- **Its arguments are `{ path, heading? }`.** One field for what the composer types as one line. A
  trailing `/` names a folder and the filename is derived; anything else names the file. The slash
  is not decoration — it is what answers *is `drafts` a new folder or a new extensionless file*
  when nothing is there to look at.
- **`create-file` and `append-to-file` stay.** `create-file` is what `⇧⏎` stores, being the only
  capability that guarantees never-overwrite through `alternatives()` suffixing; `append-to-file`
  is the only way to say *this must already exist*, which a rule aimed at a daily file wants. Three
  names, and both kinds implement all three.
- **Counts on candidate entries are dropped.** `41 notes`, `9`, `41 lines` appear in the mockups
  and `CandidateEntry` has no field for any of them. Adding one means core, the port, `/v1`, the
  regenerated OpenAPI document and the client — for decoration.
- **Tags are offered in the composer**, and the collapsed row keeps its own chooser.
  `packages/client/src/types.ts:112` settles that this costs nothing: routing is never an outbox
  operation and a shell disables it offline, so the composer only exists when the pool is
  reachable. The row's chooser is still the one that survives an unreachable pool, and that is why
  it stays.
- **Remembered places come from the pool, not from the browser.** A `localStorage` history would
  be per-browser, invisible to the mirror, and a second drifting copy of what the routing records
  already hold. The pool answers the facts — each place, how often, when last — and the shell
  ranks. Ranking is presentation, so changing between most-used and most-recent later is a shell
  change and not a wire change.
- **`under` stays free text.** `heading` carries no `x-notemap-candidates` and listing a file's
  headings is I/O neither adapter does today.

---

## Tasks

### Phase 1 — the capabilities

Depends on [destination-webdav](destination-webdav.md) having merged, so both kinds gain the new
capability together. Nothing in the shell changes in this phase.

- [x] Create branch `agent/typed-routing-composer`
- [x] `create-file`'s `directory` stops being `required` in
      `packages/adapters/destination-fs/src/capabilities.ts`, and `asCreateFileArguments` reads an
      absent one as `""`. Absent means the vault's root, which is what an empty string already
      means and what the adapter already accepts: the schema misdescribes the code
- [x] `create-or-append-file`, taking `{ path, heading? }`. `path` carries
      `x-notemap-candidates`; `heading` does not. Neither is `required` — an absent `path` is the
      root, and the filename is derived
- [x] The filesystem kind implements it by composing what `create-file` and `append-to-file`
      already do rather than reimplementing either: a missing folder is made, an absent file is
      created, a present one is appended to under `heading`
- [x] The webdav kind implements it on the same terms, over the `If-None-Match: *` create and the
      `If-Match` read-modify-write append that [destination-webdav](destination-webdav.md) phases 4
      and 5 build. Contention stays `unreachable`, not `rejected`
- [x] `filesystemCandidates` answers the new capability's `path` field the way it answers
      `append-to-file`'s — folders and files together, which is what the composer's tree reads
- [x] **Record it as an ADR.** Why a third capability rather than the composer storing what it
      inferred: delivery is deferred, the record is made against a destination that may be
      unreachable, and a decision taken when the vault could not be asked is a guess the adapter is
      in a position to make truthfully later. Also why the other two were kept. None of this is
      visible from the code
- [x] `docs/specs/core.md` gains the capability alongside the other two
- [x] Tests, both kinds: an absent file is created; a present one is appended to; a missing folder
      is made; a trailing slash derives the filename; a `heading` inserts under it
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm test:stack` — an
      arguments schema is served over `/v1`, so this crosses the layers
- [x] `git commit`

### Phase 2 — the path line

Depends on phase 1 for the field it drives, though the control is testable before the adapter is.

- [x] A new control under `apps/ui/src/components/routing/`: one monospace line holding a path,
      with the entries at the deepest complete scope beneath it. Typing filters that scope's
      entries; `/` descends; backspace at the head of a segment pops it; `⇥` completes the entry
      under the caret; `↑↓` move and `⏎` takes
- [x] The line is the value. There is no second input beside it — that pairing is what
      `CandidateBrowser` has today and what this replaces
- [x] A trailing `/` means a folder and its absence means a file, matching phase 1's `path`
- [x] The hierarchy is **shown, not walked**: the levels along the typed path, each with its
      siblings, indented. Ancestors are drawn from the answers already in hand
- [x] One `candidates` call per level, debounced, with every answer but the newest dropped — the
      race `CandidateBrowser` already guards against, for the same reason
- [x] `truncated` is said, not swallowed. A scope over the adapter's 500 cannot be filtered
      client-side into completeness and the line must not pretend otherwise
- [x] Registered in `browserFor` against the `filesystem` and `webdav` kinds. Every other kind keeps
      the existing schema-driven browser, unchanged
- [x] Tests beside it: a path parses into segments; a trailing slash reads as a folder; a filter
      narrows; `⇥` completes; ancestors survive a descent; a truncated answer is reported
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`
- [x] `git commit`

### Phase 3 — what will happen, in one word

Depends on phases 1 and 2.

- [x] The leaf is looked up in the deepest scope's answer: an entry with a matching `value` means
      the file is there and the word is `append`; no match means `create`. A prefix segment with no
      matching `scope` is a folder that will be made. **This is what is drawn, never what is
      stored** — `create-or-append-file` is what is stored, and the adapter decides again at
      delivery
- [x] The status sits **under** the line, as design `3a`: the state as an inverted word — the
      `StateWord.svelte` treatment the register already uses — then the folders to be made, in
      accent, as `+ drafts/`
- [x] `⇧⏎` says *make a new one beside it* and names what it would be called. It stores
      `create-file`, which is the capability that means exactly that. It sits on the status row
      beside the state it overrides rather than in the key hints: appending to somebody's file when
      a new one was meant is the one place *nothing to choose* can surprise, and the escape belongs
      next to the surprise
- [x] A blank leaf is not a gap. The derived name is shown before committing, and the derivation is
      unchanged — first line of the content, per `destination-fs/src/filename.ts`. Not a timestamp:
      `picker-needs-a-trail.md` reads in a vault listing and `2026-09-01-1432.md` does not
- [x] Copy throughout is a word or a mark, never a sentence: `create`, `append`, `unreachable`,
      `root gone`, `derived`, `best effort`, `+ drafts/`. A count is a number
- [x] Tests: a free name draws create; a taken name draws append; a missing prefix reports the
      folders it will make; `⇧⏎` stores `create-file`; a blank leaf submits a path ending in `/`
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`
- [x] `git commit`

### Phase 4 — tags, in the composer

Depends on phase 3. Small, and separable from everything around it.

- [x] The composer gains a `tags` row in the terse labelled shape: the pool's tags in use as spaced
      words, filtered as you type, free entry beside them. `TagsApi.inUse` is already loaded and is
      what the row's chooser reads
- [x] It is the same classification the row makes, through the outbox, and therefore **drains
      independently of the route**. If the route then fails the tags stay applied, which is the
      honest outcome and is worth a test rather than a comment
- [x] `docs/specs/shell.md` — the **Tagging** section says tagging is offered in two places and why
      they are not redundant: the collapsed row's chooser is the one that survives an unreachable
      pool, and the composer's is a convenience that exists only when routing does. The reasoning
      the section already carries stays; it is added to, not replaced
- [x] Tests: a tag taken in the composer reaches the outbox; a failed route leaves it applied
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`
- [x] `git commit`

### Phase 5 — places you have used before

Depends on phase 3. **Droppable**: the line works without it. Crosses every layer, so it is worth
dropping whole rather than half-landing.

- [x] **A new read, shaped like `candidates` and answered from the other side.** Same request —
      destination, capability, field — but the pool answers what that field *has held*, from the
      routing records it already holds, rather than what the destination offers. One is the
      vault's answer and one is the pool's, and the composer merges them
- [x] It answers **facts, not an order**: each distinct value with how many records used it and
      when the last one was. The shell ranks. Capped and `truncated` on the same terms as
      `candidates`, so a pool with thousands of records cannot make this read unbounded
- [x] Per destination, never pool-wide: a place in one vault means nothing in another
- [x] **What counts as a use: delivered, or still being tried.** A hard failure does not.
      `RoutingRecordState` is `pending | delivered` and carries no failure, so this is not a filter
      on the record: `delivery.ts` maps `rejected` to `retryable: false` and `unreachable` to
      `true`, and a job is `done`, `retry` or `abandoned` (`work.ts`). A `delivered` record counts
      outright; a `pending` one counts unless its delivery job was abandoned. **The read therefore
      reaches the job for pending records**, which is the one place this phase is more than a query
      over records — say so in the core query rather than discovering it in the store
- [x] Core query, `/v1` route, regenerated OpenAPI document, client method, and
      `docs/specs/http-v1.md` and `docs/specs/client.md` say what it is
- [x] In the line, a remembered place is **ranked into the completion list**, and the best one is
      offered as a greyed continuation after the caret
- [x] **`⇥` and `→` are different keys and stay different.** `⇥` completes the current segment from
      what the destination offered; `→` takes the whole remembered continuation. One key that means
      either depending on invisible state is the failure mode here, and fish already teaches this
      distinction on this developer's own machine
- [x] **A remembered place that is no longer there is said, not silently re-created.** A folder
      routed to twelve times and now absent is not a new folder somebody meant to make — it is a
      sign the vault was restructured, and the composer is the last place that can say so before
      the folder comes back. It is marked `gone` in the completion list, and at the caret it reads
      `create · + drafts/ · gone`, so the discrepancy is visible at the moment of committing
- [x] **A `gone` place is never the greyed continuation.** The ghost is the thing a person takes
      without reading; a discrepancy must be looked at, so it stays in the list where `↑↓` reaches
      it deliberately. This is the rule that keeps `→` safe
- [x] Both are only possible where candidates answered. Against an unreachable destination there is
      nothing to check against and the `unreachable` word already carries that — a remembered place
      is offered plainly and no claim is made about whether it is still there
- [x] `gone` is an ordinary condition and not one of the three alarms `docs/specs/shell.md` defines
- [x] The shell derives folder prefixes from remembered file paths itself; the read has no business
      enumerating them
- [x] Tests: the read counts records per value; a place used more ranks above one used later; the
      continuation is offered and taken by `→` alone; a remembered place absent from the listing
      draws as a creation; `⇥` still completes only a segment
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm test:stack`
- [x] `git commit`

### Phase 6 — the destination, by typing

Depends on phase 2. **Droppable**: the existing `where` list keeps working.

- [x] Before a destination is settled, the line completes over destination names: `obs` narrows to
      `obsidian vault`, `⏎` or `⇥` takes it. Once taken, **the destination leaves the line** and
      reads in the chrome; the line then holds nothing but the place. It is never a segment of the
      path, so a name with a space or a slash in it needs no escaping and no rule
- [x] The `where` list stays as the way in for a pointer and for a reader who does not know the
      names. Typing is an accelerator, not a replacement
- [x] Backspacing past the head of an empty line gives the destination back, so a wrong one is not
      a reason to close the composer
- [x] An `unusable` destination stays in the list saying why and cannot be taken — which is what
      `RoutingComposer` does today, and is not what unreachable means
- [x] Tests: typing takes a destination; an ambiguous prefix does not; a name with a space
      completes; the destination is absent from the submitted path; the list still works
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`
- [x] `git commit`

### Phase 7 — when there is nothing to ask

Depends on phase 3. This is the phase that keeps the offline property honest.

- [x] **An unreachable destination is not a refusal.** No tree, no drawn state, the line still
      typed, `route` still live. `docs/plans/destination-webdav.md` states the property this
      protects: an unreachable destination must still be routable, with the record made and the
      delivery deferred. Phase 1 is what makes this honest — there is nothing to infer and nothing
      that needs inferring
- [x] Distinguish it in the copy from an unreachable **pool**, which is a different condition and
      one in which the composer does not open at all
- [x] The refusal lands in the asking as a muted line — `unreachable · best effort` — never as one
      of the three alarms `docs/specs/shell.md` defines. It is the ordinary condition
- [x] `not-offered` draws the same way: a plain typed path, no tree, no drawn state
- [x] Where phase 5 landed, remembered places still complete against an unreachable destination:
      the pool holds them and the pool is reachable. That is most of what makes the line usable
      with nothing to ask
- [x] A kind with no filesystem in it draws neither line nor tree and keeps the `Group`/`Option`
      idiom it has today. `browserFor` is what decides, on the kind alone
- [x] Tests: an unreachable destination is still routable; `not-offered` draws a typed path with no
      tree; a non-filesystem kind draws the existing browser
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`
- [x] `git commit`

### Phase 8 — the docs catch up

Depends on every phase above.

- [x] `docs/specs/shell.md` — the composer section is rewritten. `do` stops being a step; the
      browser paragraph added 2026-08-31 describes a control that no longer exists for a
      filesystem-shaped kind; the per-kind lookup is no longer empty. Say what replaced it and why
- [x] `docs/specs/core.md` — confirm phase 1's capability entry reads as domain rather than as a
      description of the adapters that implement it
- [x] `CONTEXT.md` — check whether the line, or a remembered place, needs a name of its own, and
      add one only if the code and the spec both want to say it. Do not invent a term to have one
- [x] **`docs/design/` is caught up.** `composer.html` was written before the code and is the thing
      this plan was built against; now it is checked against what shipped, and where the two
      disagree the page is corrected or the code is. `queue.html` and `shell.css` are the stale
      pair — a composer beside the row and a `.tree` block that predates the candidates browser —
      and this is when they are re-rendered
- [-] Re-shoot every surface at 1440 and 390 with the command `docs/design/README.md` carries, and
      drop the note there saying `composer.html` stands alone: it no longer will _(the note is
      dropped; the shots are not re-rendered — no browser in this environment. `README.md` says
      which two are stale and how to redo them.)_
- [x] Verify: the specs and the code agree, and a reader of `docs/design/` sees the composer that
      exists
- [x] `git commit`

---

## Deferred, deliberately

- **`heading` as an askable field**, so `under` offers the file's own headings. Needs the
  annotation and I/O neither adapter does today, and both kinds would owe it.
- **Templates** — a configured folder, name and frontmatter per destination. A separate surface;
  this is the raw path, for when you are not using one. Phase 5 is its learned cousin and does not
  replace it.
- **Counts on candidate entries.** Only worth `CandidateEntry` gaining a field if something other
  than decoration wants them.

---

## Unknowns

- **Whether one `candidates` call per level is fast enough on a large vault over a slow mount.**
  Four levels is four `readdir`s, and over webdav four `PROPFIND`s, which is the worse case.
  Fallback: ask only at the deepest complete segment and draw the ancestors from the typed text
  alone, without their siblings — the trail survives, the context around it does not.
- **Whether a vault over the adapter's 500-entry cap makes typing feel broken.** Filtering is
  client-side over what was answered, so a match past the cap cannot be found by typing. Fallback:
  say the count is capped and let the person keep typing the path, which needs no listing to work.
- **Whether reaching the job to tell a retrying delivery from an abandoned one is cheap enough to
  do in one query.** Settled that it is the right rule; not settled how the store answers it.
  Fallback: count `delivered` records alone, which needs no join and costs a place used all week
  not appearing until the drive comes back.
- **Whether the drawn word and the delivered act can disagree visibly.** The composer draws
  `append`, the vault changes, the delivery creates instead. It is correct and it may still read as
  a lie. Fallback: the routing record view says what actually happened, which is its job anyway.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The path line's parsing, filtering, completion and drawn state are unit-testable without a
destination, and that is where most of the shell's evidence lives — tests beside the control, as
`RoutingComposer.test.ts` and `composer.test.ts` already do. Phase 1 is tested against both kinds,
the webdav one through the in-process DAV server [destination-webdav](destination-webdav.md)
builds. `pnpm test:stack` is required for phases 1 and 5, which change what `/v1` serves; the rest
of this plan does not cross a layer.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
