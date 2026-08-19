# Port the designed shell into apps/ui

**Date**: 2026-08-20
**Status**: Todo
**Spec**: `docs/specs/shell.md`
**Reference**: `docs/design/` — the rendered design, its stylesheet, and shots at 1440 and 390
**Closed**:

---

## Goal

`apps/ui` draws the queue and the feed as designed — one register, two columns, one line weight,
ink structure and red reserved for action and alarm — built from a named set of tokens and
primitives, such that **no component names a colour, a font, a size or a measure directly**, and no
class string describing the same thing appears in two places.

---

## The system, in one place

Everything below is visible in `docs/design/` — that directory is the reference and needs no
build, no network and no account. Read it before phase 1. `docs/specs/shell.md` says *why*; this
says *what*, so that nothing has to be inferred from a screenshot.

**How to use the reference.** Open `docs/design/queue.html` and `feed.html` directly over `file://`.
Compare your own output against `docs/design/shots/` by running the same headless command against
`pnpm dev` — the command is in `docs/design/README.md`. Check 1440 and 390 both; the layout changes
at two breakpoints and only one of them is visible on a desktop. The mockups are static HTML with
no state and no data: copy the *system*, never a class name.

**Surfaces.** Two. The queue is the root route and carries capture as its first row. The feed is
everything the pool holds. Settings exists but is not in the navigation (see unknowns).

**Frame.** Sheet → column → bar, then the stage. The column is capped at a reading measure; the
only thing that widens it is a composer opening beside the register. The bar is one row: wordmark,
the two surface links, and reachability pushed to the right.

**The register.** A grid of two columns — a fixed left column and the content — with the spine, a
one-pixel ink rule, down its right edge. A separator between captures starts where the content
column starts and runs right *past* the register's padding to meet the spine, making one junction
per capture. Nothing is boxed; nothing has a border on four sides.

**The row.** Left column: the date over the time, then the state word in the feed. Right column:
the payload, then a label/value pair per field — `tags`, `edited`, `routing`, `sent` — and the
action row last. The left column is the label column; that is the whole idea.

**Two breakpoints.**
- **56rem** — the composer stops sitting beside the row and becomes a block inside it, below the
  note. Nothing hides the register.
- **34rem** — the row becomes a single column. The stamp is a header line across the full width
  with the state word beside it, a label shrinks to its own width and sits inline before its
  value, unlabelled content spans the whole measure, and separators run edge to edge.

**Tokens.** Four colours — paper, ink, muted ink, accent. Two faces — the browser's `serif` for
prose and `monospace` for everything the interface says; the wordmark is the serif in small caps.
Two sizes — one for every monospace element, one step larger for prose, and nothing else. Four
measures — the row's gutter and gap, the spine's padding, the composer panel's width.

**Four idioms, and no others.**
- **Inversion** (ink fill, paper text) means *current or chosen*: the nav's surface, a chosen
  destination or capability, a feed row's state word.
- **Accent fill** means *the action*: `capture`, `route`. One per context.
- **Accent** alone means *attend to this*: the refusal block, the connector arrow marking a
  routing in play, a link under the cursor.
- **Muted ink** means *placeholder, unavailable, or finished*: an empty value, an unavailable
  destination, the prose of a routed or archived row.

**The primitives to build**, which is the inventory phase 2 is asking for: sheet, column, bar, nav,
reachability; register, row, label cell, value cell, content cell, separator; stamp, state word;
prose, clamp and its cue, figure; action, primary action, action row, tag, tag set, order selector,
load-more foot; composer with its group, option, tree and commit; the refusal block.

---

## Tasks

### 1 — Tokens and faces

Depends on nothing. The whole visual system, before anything is rebuilt against it.

- [ ] Create branch `agent/shell-design-port`.
- [ ] Use the browser's own `serif` and `monospace` — no webfont, no font server, nothing to
      self-host. The wordmark is the serif in small caps. The design is carried by the columns, the
      single line weight and the two sizes, not by a particular face.
- [ ] Define the token roles in `apps/ui/src/routes/layout.css` as `@theme`: the two paper/ink
      colours plus muted ink and the accent; the three faces; the two sizes (mono, prose); the
      layout measures the register depends on — gutter, gap, spine, composer panel. Tailwind v4
      turns each into both a variable and a utility, which is the mechanism the "no raw values"
      rule below relies on.
- [ ] Name the accent by role, not by hue. It means *action or alarm*; a component asking for
      "red" is a component that will misuse it.
- [ ] Settle what happens to dark. `layout.css` currently declares `color-scheme: light dark` and
      no dark palette was designed, so today the shell claims a theme it does not have. Either
      define dark values against the same roles or stop claiming it — not both.
- [ ] Remove `@tailwindcss/typography` if the prose renderer does not use it, or keep it and drive
      it from the tokens. It is currently a dependency that nothing imports.
- [ ] Verify: `pnpm --filter @notemap/ui build` succeeds and the existing app renders in the new
      palette, however badly composed it still looks.
- [ ] `git commit`.

### 2 — Primitives

Depends on 1. Structure with no domain knowledge, in `src/components/primitives/`.

- [ ] Decide the two reuse mechanisms and where the line is. **A Svelte component** owns anything
      with markup — its classes are written once, inside it. **An `@utility` in `layout.css`** owns
      a pattern of utilities with no markup of its own, used by components that do not share a
      shape. Nothing else repeats a class string; `@apply` sprawl is not the answer here.
- [ ] Build the frame: sheet, column, bar, nav, reachability state.
- [ ] Build the register: register (the spine), row (the two-column grid), the label / value /
      content cells, the separator that starts at the content column and meets the spine.
- [ ] Build the marks: stamp (date over time), the inverted state word, the inverted current-item
      idiom shared by nav, chosen option and state word.
- [ ] Build the text: the prose face with its paragraph indents, the clamp and its "+ n lines" cue,
      the figure placeholder for an asset.
- [ ] Build the controls: action, primary action, action row, tag, tag set, mono value and its
      empty variant, the order selector, the load-more foot.
- [ ] Build the alarm: the fixed corner block a refusal lives in.
- [ ] Add the gate that keeps this honest: a check that no file under `src/components` or
      `src/routes` contains a raw colour, a `dark:` variant, a font family or a hex/oklch literal.
      A failing grep is a failing test.
- [ ] Test each primitive for the contract it promises, not for its class list.
- [ ] `git commit`.

### 3 — The queue

Depends on 2. The surface notemap opens on.

- [ ] Make the queue the root route and drop capture's own route. Settings needs a way in — see
      unknowns.
- [ ] Rebuild capture as the register's first row: current date and time in the left column, the
      field in the right, `capture` and `attach` in the action row. It must keep working with the
      pool unreachable.
- [ ] Rebuild the queue rows against the primitives: capture time, prose, tags always visible and
      addable, the order selector, load more.
- [ ] Design the empty state as a surface rather than a sentence — it is the thing the queue exists
      to reach.
- [ ] Opened row: `edited`, `routing`, and the actions. No source, no heading, no revision or
      touched marks.
- [ ] Keep the existing behavioural tests passing — optimistic capture, offline disablement, the
      scroll mark — and add tests for what the register newly promises.
- [ ] Verify: `pnpm -r --silent test`, `pnpm --filter @notemap/ui check`.
- [ ] `git commit`.

### 4 — The routing composer

Depends on 3. Replaces `RouteAction` entirely.

- [ ] Build the composer as a component of the row it belongs to, positioned beside it with its
      first line level with the note's, and a connector crossing the spine at that row.
- [ ] Below the breakpoint it becomes a block inside the row instead — the item stays readable
      above the decision, and nothing hides the register.
- [ ] Step it: where, then that destination's capabilities, then the target its schema asks for.
      A settled step stays visible with its choice marked.
- [ ] Only the chosen destination is described. An unavailable one says so with its reason and
      stays in the list.
- [ ] Leave a place above `where` for a decision that arrives pre-filled with an attribution, and
      put nothing in it. Rules, capture templates and suggestions all produce that shape and none
      of them exists yet.
- [ ] Do not build the folder tree — see unknowns.
- [ ] Test: composing a decision, an unavailable destination, a capability with no target fields.
- [ ] `git commit`.

### 5 — The feed

Depends on 2. Everything the pool holds, read completely.

- [ ] Rebuild the feed rows against the same primitives — the register is one design, not two.
- [ ] Tags stay editable on every feed row, including an archived one.
- [ ] Say what became of an item: the state word in the left column, the `sent` line for a routed
      one, `unarchive` on an archived one, and muted prose on both.
- [ ] Ship the archived half regardless — `archived` is on the item. The routed half waits on the
      backend carrying routing state (see dependencies).
- [ ] Test: an archived row reads as archived and can be unarchived; tags can be changed on a
      finished row.
- [ ] `git commit`.

### 6 — Sweep and gates

Depends on 3, 4, 5.

- [ ] Bring settings and destinations onto the tokens and primitives. It is out of the design's
      scope but it must not be the one screen still wearing the old utility soup.
- [ ] Delete every leftover ad-hoc class string; the raw-value gate from phase 2 must pass across
      the whole app.
- [ ] Verify: `pnpm -r --silent test`, `pnpm --filter @notemap/ui check`, the repo's linters, and
      `pnpm test:stack` — this crosses the HTTP surface and the client's transport.
- [ ] `git commit`.

---

## Dependencies

- **Routing state has to reach the shell, and that is a backend change.** `Item` carries `archived`
  and `supersededBy` but nothing about routing: the queue excludes routed items server-side and the
  feed receives them undifferentiated, so the feed cannot say `routed` without one request per row.
  Decided 2026-08-20 that the answer is to carry it rather than to work around it. That is a slice
  across `core.md` and `http-v1.md` and wants its own plan; phase 5's routed half depends on it and
  nothing else in this plan does.

---

## Unknowns

- **The markdown library is unchosen, and so is whether captured markdown is sanitised before
  rendering.** *Fallback*: the prose primitive renders plain text behind the same interface, and
  the renderer is swapped inside it later.
- **The order control needs a client change.** `reads.ts` fixes the order per surface and
  `loadFeed` / `loadQueue` take no arguments. *Fallback*: the selector ships disabled and visible,
  and the client change lands with an amendment to `client.md` — but a stub in the interface is a
  lie, so prefer doing it in phase 3.
- **The folder tree is not buildable.** `describe()` returns capabilities and a `targetSchema`;
  nothing can enumerate a destination's folders. *Fallback*: the composer builds a form from the
  schema, as today, and the tree waits for either an adapter-published enum or a method on the
  destination port — the same seam `todo.md` predicts for preview.
- **The tag chooser has no source of names.** There is no `/v1/tags`. *Fallback*: free entry with
  no suggestions, in a control shaped to take them.
- **Settings has no way in.** Navigation is two surfaces and settings is neither.
- **The composer is absolutely positioned in the mockup and does not push the page taller.** The
  real register has to reserve that height. Visible in `docs/design/shots/queue-1440.png`, where the
  spine stops before the composer does.
- **The spec and glossary changes this plan is written against sit on `agent/shell-design`** and
  are not merged. This plan's branch depends on them.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Test what a primitive promises, not the classes it emits — a test asserting a class string
reintroduces exactly the duplication this plan exists to remove. The raw-value gate in phase 2 is
the one exception: it is a test about class strings on purpose.

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
