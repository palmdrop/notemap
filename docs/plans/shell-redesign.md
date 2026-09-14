# The shell, redrawn

**Date**: 2026-09-14
**Status**: In progress — phases 2–4, the first version, shipped 2026-09-14; phase 5 shipped 2026-09-14; 6–7 are drawn next
**Spec**: `docs/specs/shell.md`
**Closed**:

---

## Goal

The shell is set in one face at one size, ink on white with one red, on a grid of open lists and
regional rules; processing has a quick tier on the queue row and a deep tier on a surface that
advances through the queue; and every finding in
[issues-2026-09-11.md](../design/issues-2026-09-11.md) is either built or dropped with a reason.

This is a programme. Phase 1 was the design work. **Phases 2, 3 and 4 together are the first
version** and are what an agent picking this up implements, in order, one PR per phase. Phases
5–7 are named so the order is visible and are expanded when their design is drawn.

The direction is [ADR 46](../adr/0046-the-shell-is-one-face-one-size-ink-on-white-and-processing-is-a-surface.md).
The statement of the system is [the brief](../design/brief.md). **The drawings to build against
are `docs/design/redrawn/`** — `tokens.css`, `queue.html`, `process.html`, and `shots/` of each at
1440, 1000 and 390. Open the HTML in a browser; the CSS in it is the intended CSS, written plainly
so it can be read into Tailwind utilities and `@theme` roles. Where the brief and the drawings
disagree, the drawings win; where the drawings are silent, the brief answers; where both are
silent, do the simplest thing and say so in the PR.

---

## What the reader of this plan needs to know

Read, in this order, before touching code:

1. `docs/design/brief.md` — the whole system, twenty minutes.
2. `docs/design/redrawn/queue.html` and `process.html` in a browser at 1440 and at 390, and
   `#index` / `#editing` on each respectively. Then the CSS in them.
3. `docs/design/shots/` — the app **as it is**, so the distance is clear. To re-take either set
   of shots — the drawings' after editing one, the app's at the end of a phase — use the two
   `oneshot` scripts named in `docs/design/README.md`; do not write new ones.
4. `docs/specs/shell.md`, the sections `The shape of the shell`, `Capture is the first row of the
   queue`, `The row`, `The composer is for processing`, `Actions`, `Tagging`, `Tokens and
   themes`, `Visual direction`. These describe what is being replaced and are rewritten in the
   PR that replaces each.
5. `apps/ui/src/styles/tokens.css`, `routes/+layout.svelte`, `components/item/Row.svelte`,
   `components/item/Actions.svelte`, `components/queue/Queue.svelte`,
   `components/routing/ProcessingComposer.svelte` (994 lines; the logic survives, the modal does
   not), `tokens.test.ts` (the gate that stops a component naming a value).

Decisions already made, so they are not asked again:

- **Face**: Bricolage Grotesque, weights 400 and 600, self-hosted. Size 15px, line height 22px,
  everywhere. No second face, no second size. Tabular figures on the stamp only.
- **Colour**: `#fff` ground, `#000` ink, `#d40000` alarm. Dark is the inversion, chosen in
  settings; `auto` follows the browser as today. **Green goes** — a destination that answered
  says `reached` in words. **Grey goes**; `--inert` exists in the tokens for a disabled control
  and nothing uses it yet.
- **Selection** on the queue is a box around both columns with the actions as its foot
  (`queue.html`, the fifth row). Actions are words: `process manual discard` left, `edit copy
  open` right. `process` bold, `discard` red. No icons.
- **Tags** on the selected row end with a `+` that opens the tag chooser in place; no `tag`
  action word. A trigger tag is drawn as bold small-caps of the name after `route/`.
- **No state word on the queue**; the feed keeps its words.
- **The rail's furl goes.** The index view replaces it as the way to see more at once.
- **Process** is a route, `/items/{id}/process`; the modal composer is deleted. Two columns at
  ≥64rem, stacked below. `DESTINATION`, not `where`. The capture is read-only until `edit`;
  the ruled box appears only while editing.
- **Preview** is requested as soon as destination and place are settled, shown as the first
  five lines of the file in a ruled block with `more`.
- The keyboard map for the first version: `j`/`k` walk, `enter` select then open, `d` discard,
  `m` manual, `p` process, `+` tag, `esc` deselect; on the process surface `e` edit,
  `⌘/ctrl+enter` route, `esc` back.

---

## Tasks

### Phase 1 — the design phase

- [x] Branch `agent/shell-redesign` _(2026-09-14)_
- [x] Screenshots of the app as it is, every surface at 1440 and 390, replacing `docs/design/shots/` _(2026-09-14)_
- [x] `docs/design/brief.md` _(2026-09-14)_
- [x] ADR 46 _(2026-09-14)_
- [x] `docs/design/README.md` says what the directory is now _(2026-09-14)_
- [x] A fresh Claude Design project, `notemap shell — redrawn`, holding the brief, the issues and
      the inspiration notes _(2026-09-14)_
- [x] Round 1 drawn and looked at; round 2 drawn on the feedback; ten faces sampled _(2026-09-14)_
- [x] Chosen: Bricolage Grotesque; selection as a box; words not marks; `+` for tags _(2026-09-14)_
- [x] The settled drawings as static files in `docs/design/redrawn/` with shots _(2026-09-14)_
- [x] ~~Open a PR for the docs alone~~ — the docs went with phases 2–4 in one PR (#61)
      _(2026-09-14)_

### Phase 2 — the system: face, size, palette, chrome

One PR. Nothing in it changes what a surface does; everything in it changes how every surface
looks. The queue will look odd at the end of this phase — old row, new type — and that is fine.

- [x] **Self-host the face.** Download Bricolage Grotesque as a variable `woff2` (Google Fonts
      serves it; the licence is OFL) into `apps/ui/static/fonts/`, one file, latin subset. An
      `@font-face` in `styles/base.css` with `font-display: swap`, weights 400–600. Check the
      daemon serves `static/` with the app (it serves the built `apps/ui/build`, which includes
      `static/`); check the CSP, if one is set, allows `font-src 'self'`.
- [x] **Tokens.** Rewrite `styles/tokens.css`. Roles, with the values from
      `docs/design/redrawn/tokens.css`:
      `--color-ground`, `--color-ink`, `--color-alarm`, `--color-inert` (defined, unused);
      `--font-shell`; `--text-shell: 15px` with `--text-shell--line-height: 22px`;
      `--spacing-rail: 11rem`, `--spacing-rail-narrow: 5.75rem`, `--spacing-gutter: 1.5rem`,
      `--spacing-measure: 72rem`, `--spacing-read: 44rem`, `--spacing-prose: 38rem`,
      `--spacing-gap-time: 28px`; `--breakpoint-narrow: 44rem`, `--breakpoint-wide: 64rem`.
      Delete `paper`, `ink-muted`, `accent`, `good`, `prose`/`mono` faces, both text sizes, and
      every composer/modal/tree/consult/log-rail spacing. `light-dark()` stays: ground and ink
      swap, alarm does not. The dark values are `#000`/`#fff`, nothing warmer.
- [x] **Base.** `styles/base.css`: body in `--font-shell` at `--text-shell`; `a:hover` is an
      underline, never a colour; `text-wrap: pretty`.
- [x] **Port the components** so every `font-mono`, `font-prose`, `text-mono`, `text-prose`,
      `text-ink-muted`, `text-good`, `text-accent`, `bg-ink/5`, `border-ink/20` is gone.
      Counts at the time of writing: `font-mono` 65 uses in 40 files, `text-ink-muted` 128,
      `text-good` 4, `font-prose`/`text-prose` 8. Muted becomes regular weight (drop the class);
      a label that was muted-and-small becomes `uppercase tracking-[var(--track-caps)]`;
      `text-accent` on a failure or a destructive action becomes `text-alarm`, and on anything
      else (a link under the cursor, a primary action, the open row's edge) it is dropped.
      Primary actions are `font-semibold`; the one inverted control is `capture`/`route`.
- [x] **Extend the gate.** `tokens.test.ts` gains a `FORBIDDEN` entry per retired class name so
      none comes back: `font-mono`, `font-prose`, `text-mono`, `text-prose`, `text-ink-muted`,
      `text-good`, `text-accent`, `text-paper`, `bg-paper`. Keep the existing entries.
- [x] **The bar.** `routes/+layout.svelte` and `primitives/frame/Bar.svelte`, `Nav.svelte`:
      four surfaces `queue · feed · log · settings` as one `Nav`, the current one
      `font-semibold` (drop the `inverted` class), no wordmark, no `Order`, no `Shown`, no
      `Waiting`, no `ThemeToggle`. One glyph at the right: `●` reachable, `○` unreachable, `◐`
      when the outbox holds work, with `title` saying which and the count. One component,
      `frame/Status.svelte`, replacing `Reachability.svelte` and `Waiting.svelte`. The signed-out
      bar keeps the word `notemap`, in the face, regular.
- [x] **The order control moves.** `Order.svelte` is rendered by `Queue`, `Feed` and `Log` in a
      list head of their own (`primitives/register/Head.svelte`: a flex row, `justify-between`,
      `pt-5 pb-2`), not by the layout. The log's `Shown` count goes with it, into the log's head.
- [x] **Theme in settings.** `ThemeToggle` leaves the layout; settings gains an `Appearance`
      section with the same three-way choice drawn as a row of options (`auto · light · dark`,
      the chosen one bold). `lib/theme.svelte.ts` is unchanged.
- [x] **Spec.** Rewrite `Tokens and themes` and `Visual direction` in `shell.md`, and the bar
      paragraph of `The shape of the shell`. Add a `Shipped:` entry linking here.
- [x] Typecheck, tests, lint; `git commit`. _(2026-09-14)_

### Phase 3 — the queue row and the quick tier

One PR. `queue.html` is the drawing; `queue-1440.png`, `queue-390.png`, `queue-index-*.png` the
shots. The feed shares the row and gets the new row for free; its own head and words are not
redesigned here beyond what the shared row forces.

- [x] **The register.** `primitives/register/Register.svelte`: a grid of
      `[var(--spacing-rail)_1fr]` with no column gap; below `narrow`, `[var(--spacing-rail-narrow)_1fr]`.
      Delete `Furl.svelte`, `lib/rail.svelte.ts`, the `furled` prop everywhere, and the `brief`
      variant (the log takes its own measure in phase 5). `Rail.svelte`: `border-r border-ink`,
      `py-3 pr-4`; no top rule, no `lit` fill, no accent edge. `Body.svelte`: `py-3 pl-gutter`,
      `min-w-0`; no top rule.
- [x] **The selected row is a box.** Selection is what `opened` already is; rename to `selected`
      where it reads better. On the selected row: `Rail` takes `border-t border-l -ml-3 pl-3`,
      `Body` takes `border-t border-r -mr-3 pr-3`, and a third grid cell — `Actions` — spans both
      columns with `border-x border-b -mx-3 px-3 h-9` (`queue.html`, the CSS under “the selected
      row”). Below `narrow` the negative margins are `-2` (8px). Nothing else about the row
      changes when it is selected: no fill, no colour, no facts appear.
- [x] **The rail's content.** `Stamp` draws date and time on one line (`tabular-nums`, `gap-[1ch]`),
      stacked below `narrow`. `Tags` draws the words in a wrapping row with `gap-x-[1ch]`, a
      trigger tag as `font-semibold [font-variant-caps:all-small-caps] tracking-[0.04em]`
      showing the name after `route/`, and — on the selected row only — a `+` after the last
      tag that opens the existing `TagSet` chooser in place. `StateWord` is not drawn on the
      queue (`Row` takes `surface: "queue" | "feed"`; `became()` is only consulted on the feed).
      `Pending` stays, as a word. `Routing` (where it went) is feed-only already. The `edited`
      fact goes.
- [x] **The body's content.** `Payload`/`Prose` capped at `max-w-prose` (38rem). The picture
      placeholder and the picture itself keep their current size rule. No muting of finished
      items (there is no muted ink); a discarded item on the feed says so in its word.
- [x] **Actions.** `item/Actions.svelte` becomes the box's foot: left `process` (bold), `manual`,
      `discard` (`text-alarm`); right `edit`, `copy`, `open`. `unarchive` stays where it was
      offered, in the left group, on a discarded row. Words only. `manual` calls
      `client.routing.markProcessed(id, {})` at once, with no note — the note is offered on the
      process surface's `otherwise` band, not here — and the corner says `marked manual` with
      `undo` (the take-back `Routing.svelte` already offers on a decision made by hand).
      `discard` calls `client.archive(id)` at once and the corner says `discarded` with `undo` →
      `client.unarchive`. Both leave the row held as processing does today (`Queue.svelte`'s
      `keep`). `open` → `/items/{id}`. `process` → `/items/{id}/process` (phase 4; until then it
      may keep opening the modal).
- [x] **Double click** on a row goes to `/items/{id}/process`, not to the item (`Row.svelte`,
      `onreach`). The item is reached by `open`.
- [x] **The capture box.** `capture/CaptureRow.svelte` stops being a row: a `border border-ink`
      box above the list head spanning the page, `min-h-[88px]` field with no placeholder and no
      stamp, a foot with `attach` left and `capture` right, `capture` bold behind a `border-l`.
      `⇧⏎` still commits. A chosen picture draws inside the box above the text. `not captured`
      goes. Rename the component `Capture.svelte`.
- [x] **The list head.** `primitives/register/Head.svelte` (from phase 2) holds, left, the view
      toggle `timeline · index` (the current one bold) and, right, `Order`. The view is on the URL
      as `view=index`, remembered per surface the way order is (`lib/order.ts` shows the pattern;
      a sibling `lib/view.ts`).
- [x] **The index view.** `queue/Index.svelte`: a grid of `[max-content_1fr_max-content]` with
      `gap-x-6`; per item one line — the stamp as `2026-09-13 07:02`, the first ~96 characters of
      the text cut at a word with `…`, the tags at the right (below `narrow` the tags column is
      dropped). Where the gap to the previous item in reading order is more than 12 hours, the
      line takes `pt-[var(--spacing-gap-time)]` — the same size whether a day or a month passed.
      A selected line is bold; `enter` on it goes to process; `j`/`k` walk it. The feed gets the
      same view for nothing if `Index` takes items and a `selected` id; do that.
- [x] **The drained queue.** `Drained.svelte` is one line, `Nothing left to process.`, in the
      body column's position (`pl-[calc(var(--spacing-rail)+var(--spacing-gutter))] pt-8`), and
      no register is drawn under it.
- [x] **Keyboard on the queue.** In `Queue.svelte`, extending the `esc` handler that exists:
      `j`/`k` move the selection and scroll it into view, `enter` selects the row under the
      cursor or, if selected, opens process, `d` discard, `m` manual, `p` process, `+` opens the
      tag chooser, `esc` deselects. None fire while `writing()`.
- [x] **Tests.** `Row.test.ts`, `Actions.test.ts`, `Queue.test.ts`, `register.test.ts` updated;
      new: the box appears on selection and nowhere else; `manual` and `discard` act from the row
      and raise the corner; `+` appears only on the selected row; the index draws a gap after
      more than 12h and not after less; `view=index` survives a reload; the drained line.
- [x] **Spec.** Rewrite `Capture is the first row of the queue`, `The row`, `Actions` (the
      quick tier), `Draining`, and the rail/furl paragraphs of `Visual direction` in `shell.md`.
      `Shipped:` entry.
- [x] Typecheck, tests, lint; `git commit`. _(2026-09-14)_

### Phase 4 — the process surface

One PR. `process.html` is the drawing; `process-1440.png`, `process-1000.png`,
`process-editing-1000.png`, `process-390.png` the shots. This deletes the modal composer.

- [x] **The route.** `routes/items/[id]/process/+page.svelte` and `+page.ts` (load the item as
      `items/[id]/+page.ts` does). The page renders `components/process/Process.svelte` with the
      item. Reached from the row's `process`, from a double click, from the feed's `process`, and
      from the item page.
- [x] **Lift the logic out of the modal.** `routing/ProcessingComposer.svelte` holds the state
      machine — destination line, template resolve, path line, candidate browser, schema fields,
      tags, words, preview, route, discard, manual with a note — and it all survives. Move it
      into `process/Process.svelte` with the sub-components it already uses (`DestinationLine`,
      `PathLine`, `CandidateBrowser`, `ComposerTags`, `Output`; `UsedBefore` reduced to a count
      and a last-place beside the destination's name). Delete `primitives/composer/Modal.svelte`
      and whatever of `Commit`, `Group`, `Labelled`, `Option` has no other caller afterwards.
      `Queue.svelte` and `Feed.svelte` lose the `routing` state and the `<ProcessingComposer>`;
      `onprocess` becomes a `goto`.
- [x] **Layout.** From `process.html`: the bar, then a frame. Below `wide` the frame is a
      column at `max-w-read`: head (`border-b`, `max-h-[40%]`, its own scroll), middle
      (`flex-1 overflow-auto`), foot (`border-t h-12`). From `wide` up the frame is a grid
      `[minmax(0,2fr)_minmax(0,3fr)]` at `max-w-measure`: the head fills the left column top to
      bottom with a `border-r`, the middle and the foot stack in the right column. Only the middle
      ever scrolls; the head and foot are always visible.
- [x] **Head.** Stamp and tags on one line with `edit` at the right; under it the capture
      (`max-w-prose`). `edit`, a double click on the words, or `e` opens editing: the words
      become a `textarea` in a `border border-ink p-[10px_12px]` box, `max-w-none`, with
      `keep the capture's` and a bold `done` under it; `edit` is hidden meanwhile. The edited
      words are the delivery's `content` exactly as the modal's `rewrite`/`words` were — the item
      is never changed. A picture capture draws the picture above the words.
- [x] **Middle.** Sections as `grid-cols-[9rem_1fr] border-b py-3`, the label
      `uppercase tracking-caps font-semibold`; below `narrow` the label stacks above the content.
      In order:
      **destination** — one field (the existing `DestinationLine`) whose typed text narrows three
      bands drawn under it, each `grid-cols-[9rem_1fr]` with an uppercase label and a rule
      between bands: `templates` (name left, pattern right), `destinations` (name left, `N routed
      · last <when>` right from `remembered`), `otherwise` (`manual` with `processed by hand`
      right, `discard` in alarm). The matched entry is bold; `⇥`/`⏎` take it as today.
      **place** — the typed line and the tree beneath it as today (`PathLine`); for a flat
      browse the flat list. **tags** — the row of words with `+`, the `TagSet` chooser.
      **preview** — a `border border-ink` block, `whitespace-pre-wrap`, showing the first five
      lines of what `client.routing.preview` answers, `more ▾` at the bottom right expanding to
      all of it. Requested automatically once a destination and its required arguments are
      settled and again whenever they or the words change, debounced 400ms; while it is in
      flight the block keeps the last answer; a destination that offers no preview draws the
      block with `no preview for this destination` and one that cannot be reached with
      `out of reach`, neither in alarm. The label is `preview` and nothing says who writes.
      Sections after the first are drawn collapsed — label only, the content on a press or when
      the flow reaches them — **except** when they already hold something.
- [x] **Foot.** `← previous` and `next →` on the left walk the queue in its current order
      without deciding anything; a bold inverted `route` on the right (`bg-ink text-ground
      px-5 h-8`). `route` is enabled exactly when the modal's was. Taking `manual` or `discard`
      from the `otherwise` band acts at once, as on the row.
- [x] **After a decision** — route, manual, discard, or a template tag — the corner says what
      happened as it does today and the surface **advances to the next unprocessed item** in the
      queue's order; when there is none it returns to the queue. `esc` returns to the queue with
      the item still selected (`?selected=<id>` on the queue's URL, read once on arrival). The
      queue's own `keep`/`held` logic goes with the modal: a processed item is seen on the feed.
- [x] **Keyboard on the surface.** `e` edit, `esc` (not editing) back, `⌘/ctrl+enter` route,
      `[`/`]` previous/next. None fire while `writing()` except `⌘/ctrl+enter`.
- [x] **Tests.** `Process.test.ts` replacing `ProcessingComposer.test.ts`: the three bands
      narrow together; a template taken draws its resolution; preview requested on settle and
      re-requested on change, not before; editing state and `keep the capture's`; route advances
      to the next item and returns to the queue when none; `esc` returns selected; the two
      layouts by width (assert the classes, not the pixels).
- [x] **Full stack.** `pnpm test:stack` — a new route and the composer's transport moved; run it.
- [x] **Spec.** Rewrite `The composer is for processing`, `The place is one line you type` where
      it speaks of the modal, `One way out of the queue`, and the `/items/{id}` paragraph of
      `An item has an address` to name `/process`. Retire the composer's `Prior decisions` that
      no longer hold with a dated note rather than deletion. `Shipped:` entry. Delete
      `docs/design/composer.html`, `composer.css`, `queue.html` (the old one), `shell.css`.
- [x] Typecheck, tests, lint; `git commit`. _(2026-09-14)_

### Phase 5 — item, records and the log

Drawn 2026-09-14 as `Records.dc.html` in the Design project, one round, and chosen with three
changes that the static drawings carry and the canvas does not: **1a** for the item (records as
rows of the register) **with a rule between the capture row and the record rows**; on the log
**the kind sits under the stamp in the rail**, not in a column of its own; and **the log is the
register** — a vertical rule between the rail (stamp, kind) and the body (words, fact, block), as
on the queue and the feed. The tab row, the record block and the per-kind fact are as drawn.

Two PRs, **5a** then **5b**: the block has to exist before the log can draw it, and the log is a
surface of its own. `item.html` and `log.html` in `docs/design/redrawn/` are the drawings for
both, landed with 5a.

Decisions made in the drawing, so they are not asked again:

- **The block** is one component drawn in three places — the item, the record page, the log — and
  reads as a file: head `**Destination** / place`, capability in plain words at the right
  (`created`, `appended`, `created or appended`, `marked processed`) and `via <template>` where a
  template applied it; a properties band for the output's front matter; the item's attachments
  above the rendered words; the destination's note where there is one; a foot of `raw` and
  `arguments` behind a press, `open ↗` where the record carries a URL, `cancel` (alarm) on a
  pending record, `undo` on a by-hand one, `item` only in the log. Nothing says `where it
  landed`, `what was sent`, `its tags did not go`, `the decision` or `routing record`.
- **`delivered` is said**, in the rail of the record's row, as `pending` and `manual` are. The
  rule that a state is said only where it is not `delivered` was a rule for a row's summary
  line and does not hold for a row of its own.
- **The kind's words**: hyphen drawn as a space (`DELIVERY FAILED`); `archived` drawn
  `discarded`, `unarchived` drawn `undiscarded`, and the row action `unarchive` renamed
  `undiscard` with them. The pool's kinds are untouched.
- **One fact per row**, not the flattened detail: the tag, the template's name, the reason, the
  refusal code in alarm. Ids are never drawn.
- **`history`** is the word for the log narrowed to one item, reached from the item's actions,
  and the word `only this` goes. Its head is `HISTORY <first words> · all of the log`.
- **No count** in the log's head; a refusal still takes the head, in alarm.
- **The half-day gap** opens on the log as it does on the index.

#### 5a — the block, the item, the record page

- [x] Branch `agent/shell-redesign-5a`.
- [x] **Drawings.** `docs/design/redrawn/item.html` (the item with two record rows and the rule
      between; `#record` draws the one-record page) and `log.html` (`#routing`, `#history`),
      written plainly from `Records.dc.html` with the three changes above, in the CSS idiom of
      `queue.html`. Extend the shot list in the `notemap-shoot-drafts` oneshot — `item`,
      `item-record`, `log`, `log-routing`, `log-history`, each at 1440 and 390 — and re-take
      `redrawn/shots/`. Delete `docs/design/feed.html`, `log.html`, `log.css`; rewrite the table
      in `docs/design/README.md`.
- [x] **A CommonMark renderer** is chosen — the open question in `shell.md` since 2026-08-19 and
      the developer's call. Ask before adding it. Whatever is chosen renders through
      `primitives/text/Prose.svelte` so a capture and an output are drawn by one thing; every
      element at the one size, a heading bold; raw HTML in the source is escaped, not rendered,
      and links follow only `http`/`https` as `lib/link.ts` already rules.
- [x] **Front matter read.** `readFrontmatter(text)` beside `fixedFrontmatter` in
      `packages/output-markdown/src/frontmatter.ts`, reading exactly the subset the writer
      emits — scalars and a string list — into key/value pairs plus the body after the closing
      `---`, and answering nothing for text that has none. Tested by round trip.
- [x] **`record/Block.svelte`.** Takes what a block needs — destination name, capability,
      place and URL, state, when, the applied template's name, the record id, the by-hand note,
      the output's note and whether content was kept — and the held item where a surface has it,
      for the attachments. Reads the output on arrival exactly as `Record.svelte` does today
      (once, not retried on its own, `read it` offered after a failure). Draws: the head; the
      properties band from `readFrontmatter`; `Figure` per attachment; `Prose` of the body;
      the note; the foot. A pending record's body is one line, `not yet delivered`; a record
      whose delivery kept nothing says `nothing kept`. `raw` toggles the bytes as
      `whitespace-pre-wrap` text below the rendered body; `arguments` toggles the record's
      arguments named against the capability's schema, which `lib/arguments.ts` still does.
      `cancel` → `client.routing.cancel`, `undo` the same call, both raising the corner and
      calling `onundone`. Place and destination names resolve as `item/Routing.svelte` resolves
      them now.
- [x] **`item/Item.svelte`.** The capture row as it is, minus the `edited` fact (gone from rows
      in phase 3) and minus `Routing.svelte` (its lines stay on the feed row). Then a cell
      spanning both columns with `border-t`, then one row per record: `Stamp` and the state word
      in the rail, `Block` in the body. Out of reach and refused read as today, in the first
      record row's place.
- [x] **`record/Record.svelte`** (`/items/{id}/records/{recordId}`) is the same register with the
      capture row and one record row; a record that is gone says so as today.
- [x] **`item/Actions.svelte`** gains `history` in the right group, offered only where `address`
      is undefined — the item page — going to `logHref(order, item.id)`. `unarchive` → `undiscard`.
- [x] **Tests.** `Block.test.ts` (new): the head reads destination, place, capability and
      template; front matter becomes the band and leaves the body; `raw` and `arguments` are
      hidden until pressed; `cancel` only on pending, `undo` only by hand, `item` only in the
      log; output read on arrival and not re-read after a failure. `Item.test.ts`,
      `Record.test.ts`, `Actions.test.ts` updated: the rule cell, one row per record, `history`.
      `frontmatter.test.ts` round trip.
- [x] **Spec.** In `shell.md`, rewrite the record paragraphs of `An item has an address` — rail
      facts, `routing record` heading, `the decision`, the arguments' absence — as the block; the
      `Content` section for the renderer; close the markdown open question. `CONTEXT.md` gains
      `history` (the log narrowed to one item) and notes `undiscard`.
- [x] Typecheck, tests, lint; shots of the app re-taken with `notemap-shoot-app`; `git commit`.
      _(2026-09-14; the item and record shots re-taken by hand — `notemap-shoot-app` still walks
      the modal composer and wants rewriting for the process surface)_

#### 5b — the log

Depends on 5a for `Block`.

- [x] Branch `agent/shell-redesign-5b`.
- [x] **Head.** `log/Views.svelte` becomes the ruled tab row: the five names on the list head's
      bottom rule, the current one bold and boxed on three sides so it sits on the rule; `Order`
      at the right on the same rule. `Shown.svelte` goes; the refusal it carried is drawn in the
      head in alarm. Below `narrow` the tabs do not wrap — the row scrolls sideways.
- [x] **Row.** `LogRow.svelte` on the register: rail `Stamp` then the kind as
      `uppercase tracking-caps`, `text-alarm` on the three failure kinds, words per the decisions
      above (`lib/kinds.ts`, tested); body the item's first words as a link (`Says`) at the left
      and the row's fact at the right, the fact stacking under the words below `narrow`.
      `About.svelte` goes. The fact per kind is a small table in `lib/actions.ts` naming which
      pair is drawn (`tag`, `name`, `reason`, `code`, …) and how an id resolves (`template` →
      name via `lib/templates.ts`, `destination` → name); a kind with no entry draws its
      flattened pairs as today, so a kind nobody has written yet still reads.
- [x] **Block under a routing kind.** `routed` draws `Block` beneath the row from the action's
      detail — destination, capability, pointer, template — with the output read by the record id
      the detail carries; `delivery-failed` draws the head and the failure's detail in alarm as
      the body; `delivery-cancelled` the head and `called off`. `template-fired` draws no block;
      its fact is the template's name. The block spans the body column.
- [x] **History.** The paragraph above the list becomes `HISTORY <first words> · all of the log`,
      the words linking to the item and `all of the log` widening while keeping the view.
- [x] **The gap.** Where more than twelve hours passed between a row and the one before it in
      reading order, both cells take `pt-[var(--spacing-gap-time)]`, with whatever phase 3 wrote
      for the index reused.
- [x] **Tests.** `log.test.ts` extended: the tab row marks the current view; the kind is in the
      rail; one fact per row and never an id; a block under `routed` and none under `tagged`;
      the history head; the gap after more than twelve hours and not after less.
- [x] **Spec.** Rewrite `The log` in `shell.md`: the register, the kind in the rail, the fact
      per kind (retiring *flattened generically, never per kind* with a dated note), the tab row,
      `history`, the block, no count. `Shipped:` entry.
- [x] Typecheck, tests, lint; shots re-taken; `git commit`.

**Unknowns, and what happens if they go the wrong way**

- *Which renderer.* ~~Not this plan's to pick.~~ `micromark`, chosen 2026-09-14.
- *Where assets landed.* `RoutingRecord` carries no such fact — only `pointer`, `url` and
  `output` — so the `ASSET` band in the drawing is **not built** here; recording asset landings
  on the record is a core change and its own plan. The block draws the item's attachments above
  the words instead, which is what the file looks like and not where its assets went.
- *Output reads in the log.* One read per `routed` row on a page, on arrival — built that way
  2026-09-14, with a `no-output` refusal read as `nothing kept`. If that proves heavy, the log's
  block reads on a press — `output` in the foot — and the item and the record page keep reading
  on arrival.
- *A template that was deleted.* Its name is gone from `client.templates.held`; the block says
  `via a template`.

### Phase 6 — settings

The side menu and the five sections. Drawn first.

### Phase 7 — motion

The few structural transitions, after everything they move exists.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Phase 1 has nothing to test. From phase 2 on, the token gate in `apps/ui/src/tokens.test.ts` is
extended before any component names a value, and each phase's tests assert what the shell draws,
enables and disables. Run `pnpm -r --silent test`, `pnpm typecheck`, `pnpm lint` at the end of
each phase; `pnpm test:stack` at the end of phase 4. Phase 5 adds no route and moves no
transport, so it does not need the stack suite.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
