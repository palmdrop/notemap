# The phone-first shell

**Date**: 2026-11-13
**Status**: In progress
**Spec**: `docs/specs/shell.md`, `CONTEXT.md`
**Closed**:

---

## Goal

`apps/ui` draws the redesigned shell: the phone's views at every width below 900px, and at 900px
and wider the same views with a wide form of each piece, as
[ADRs 71 to 76](../adr/0071-the-shell-is-drawn-for-a-phone-first-in-blocks-on-three-surfaces.md)
decide and [`docs/design/mobile/`](../design/mobile/) draws. Every control the shell has today
still has a place. `shell.md` and `CONTEXT.md` describe what is built. The developer then tunes
placement against the built app in a separate step.

---

## What to read first

All of it is in the repo, on this plan's base. Read it before phase 1. Go back to it at the start
of every phase for the views that phase builds.

- **Decisions.**
  - The ADRs: [71](../adr/0071-the-shell-is-drawn-for-a-phone-first-in-blocks-on-three-surfaces.md)
    (the visual system),
    [72](../adr/0072-processing-is-a-quick-sheet-and-a-route-in-steps.md) (processing),
    [73](../adr/0073-the-register-is-read-by-day-and-the-rail-goes.md) (rows by day only),
    [74](../adr/0074-the-status-line-is-at-the-foot-of-the-lists-while-something-is-true.md)
    (the status line),
    [75](../adr/0075-a-setting-left-unset-is-drawn-as-its-default.md) (unset settings),
    [76](../adr/0076-a-wide-window-draws-the-same-views-with-a-wide-form-of-each-piece.md)
    (a wide window).
  - [`docs/design/mobile/DECISIONS.md`](../design/mobile/DECISIONS.md): every detail settled with
    the developer, with the words, the states and the wide table. Its "For the plan" section lists
    what changes in `CONTEXT.md` and `shell.md`. **It is the checklist for this plan.** Where it
    disagrees with a drawing, it wins.
- **The design.**
  - [`docs/design/mobile/`](../design/mobile/) is a working mock in plain HTML, CSS and JS. Serve
    it with `node docs/design/mobile/server.mjs 5190`. Open `index.html`, which links every view
    and state. Add `?frame=full` for the wide form at 900px and wider. Read the CSS for sizes,
    and the JS for behaviour: what a press does, what a state says, what history does.
  - **Port the behaviour, not the code.** The mock's JS stands in for the client and the pool, and
    none of it belongs in the app. The app keeps its own `lib/` (client, `command/`, marking,
    filtering, firings, notices, records…) and redraws on top of it.
  - `css/tokens.css` holds every colour, face, size and spacing, by role. `css/bars.css` holds the
    bars and the choices. `icons/notemap.svg` is the sprite to ship (Carbon with Tabler's route;
    licences in `icons/sets.json`). The other sprites there are not used. `fonts/syne/` and
    `fonts/arimo/` hold the faces to ship (SIL OFL 1.1).
- **Shots.**
  - [`docs/design/mobile/shots/`](../design/mobile/shots/) has every state at 390 in the order of
    a walk through the shell. `w*` is a wide window at 1440 by 900, or 1000 where the name says
    so.
  - Re-take them after the design changes:
    `oneshot run notemap-shoot-mobile http://127.0.0.1:5190/ <dir>`.
  - Shots of the built app: `oneshot show notemap-shoot-app` holds the recipe for a scratch daemon
    and the walk. Adapt a copy for the new routes and states, and keep it in `/tmp`, not the repo.
    Both scripts read `PLAYWRIGHT_CORE` and `CHROMIUM` and default to this machine's.
- **Reviews.**
  - [The audit of 2026-10-30](../reviews/mobile-rethink-audit-2026-10-30.md): what was wrong with
    the shell on a phone. It closes with a table of every control today and where it goes, which
    is what "no feature lost" is checked against.
  - [The first](../reviews/mobile-design-review-2026-11-09.md) and
    [second](../reviews/mobile-design-review-2026-11-13.md) design reviews: why the details are as
    they are. Their findings are resolved in `DECISIONS.md`.
- **The specs and the words.** `CONTEXT.md`. `docs/specs/shell.md`, which is 3800 lines and is
  rewritten a section at a time, alongside the code that section describes. `docs/specs/client.md`
  and `docs/specs/http-v1.md`, for what the client and the pool already offer.

---

## Settled

The developer's own, not reopened here:

- **One build for everything.** The browser at a desk, the browser on a phone, and later an app
  that wraps the same build. Nothing is written twice for a width. A piece that differs by width
  is one component with two forms, chosen by width, and both forms are built in the same phase.
- **The wide form starts at 900px**, and the menu is a rail of icons from 900 to 1199px. Below
  900px is the phone's form.
- **Placement is tuned after this plan**, by the developer, against the built app. Build what is
  drawn. Where a drawing is plainly wrong once it is built, note it for the tuning step rather than
  redesigning it.
- **The index view stays**, as a second way to read the queue and the feed, chosen in the filter.
  Draw it in the spirit of the old one (one line per item, the time, the first words, the tags),
  in the new register and by day. The developer gives feedback on it after this plan.
- **Dark ships rough.** An inversion of the new tokens by role, so every view works in it, marked
  rough for the developer's feedback once it is built. It is not designed beyond that here.
- **One branch for the redesign.** The ADRs, the design, the reviews, this plan and the code all
  land together, on `agent/mobile-first-rethink`, in one PR. This departs on purpose from "branch
  per plan": the developer asked for it so that the docs and the code they describe merge as one.
- **Out of scope:** wrapping the build as a mobile app. That is a follow-up plan, and it needs the
  daemon's address set in the app, an access token instead of the session cookie, and CORS on the
  daemon for the app's origin. Don't build anything here that rules any of those out, for example
  by assuming the shell is always served from the daemon's origin.

---

## Motion

Transitions and movement are part of the design, not something added at the end. Keep them in
mind in every phase, and add them wherever they help someone see what changed:

- **Sliding.** A sheet rises from the foot, and a panel comes in from the side. The drawer comes in
  from the left. The item view comes in over the list on a phone, and Previous and Next slide it
  sideways. The route's steps move on sideways. A row leaving at the end of its window, or on
  Done, Discard or a swipe, slides out and the rows below close up. A row being swiped follows the
  finger.
- **Fading.** The veil behind a sheet or dialog fades in. The line over the item's bar fades in,
  and so do a passing message on the status line and the red strip.
- **Movement in place.** A spinner turns while something is under way. A countdown changes in
  place. A picked template or destination folds to one row when wide. A batch's selection marks
  its rows.

Motion follows the shell's existing rules: `lib/motion.ts`, `components/primitives/motion/`, and
`shell.md` on motion and tokens. Durations are tokens. Everything is still under
`prefers-reduced-motion`. Movement says what happened, and never delays a press or the next read.
The mock draws some of it (`.leaving`, the sheets, the swipe). Where it draws none, choose it to
the same rules, and list what you chose for the tuning step.

---

## Unknowns

- **"Set a password" on an open pool.** The pool answers with no password set (`http-v1.md`, health),
  but nothing in `http-v1.md` sets a password over HTTP. If no route exists, Access says the pool
  has no password and how to set one in the config, with no button. Don't add a route in this plan.
- **"12 of 61 shown" on the feed's foot.** The design counts what is left, and the feed's pages
  may not carry a total. If they don't, the foot says "Load 20 more" with no count, and the
  missing total is noted for the developer. Don't add a total to the API here.
- **The withdraw dialog says what the destination answered.** That needs the destination's
  answer to a withdraw. If the record does not carry it, the dialog says what withdrawing does,
  as today.
- **A batch's countdown and its one Cancel.** `POST /v1/routing/cancel` and a batch's `reserved`
  records exist (`http-v1.md`, "A batch of items"). If cancelling a whole batch takes one call per
  record, the shell sends them together and says so once.
- **The old `narrow` breakpoint** (`--breakpoint-narrow`, 44rem, read in `lib/breakpoint.ts`).
  Fold it into the 900px wide breakpoint unless something still needs a third width. If something
  does, name it in `tokens.css` by what it is for.
- **Swipe on a row against the system's edge swipe.** The design leaves 24px at each edge to the
  system. Check this on a real phone if one is reachable (`node server.mjs 5190 0.0.0.0` serves
  the design to the network). If an edge swipe still fires the row, widen the guard.
- **How much of `shell.md` survives.** Most sections describe the old register. Where a rule
  still holds (keys, offline, drafts, dropping files, endless scroll), keep it and its dated
  history. Where it is replaced, rewrite it and leave the shipped log alone.

---

## Phases

Each phase leaves the app building, tested and usable, even if its look is mixed while the old
views wait their turn. Each phase rewrites the `shell.md` sections it builds and checks every
view it touches at 390 and at 1440, against the design's shots.

**Verifying a phase**, unless the phase says otherwise:

- `pnpm typecheck`, `pnpm -r --no-sort --silent test` and `pnpm lint` are clean.
- The app's shots of every state the phase built, at 390 by 844 and 1440 by 900, sit beside the
  design's shots of the same states in an artifact (`artifact new`). Differences that are not
  deliberate are fixed. Deliberate ones are listed.
- `pnpm test:stack` runs only for a phase that changes how the shell talks to the pool.

### Phase 0: Worktree and baseline

Depends on nothing.

- [x] (2026-11-13) Work on `agent/mobile-first-rethink`, in its worktree at `~/repos/notemap-rethink`, separate
      from `~/repos/notemap`, and only there. If the worktree is gone, add it again at that path
      with `git worktree add`. Rebase on `main` first if `main` has moved and the branch has no
      open PR. `pnpm install --frozen-lockfile`
- [x] (2026-11-13) Shoot the app as it is at 390 and 1440, every route, into an artifact, as the "before"
- [x] (2026-11-13) Commit (this plan's checkboxes)

**Verify**: `git -C ~/repos/notemap-rethink branch --show-current` is `agent/mobile-first-rethink`,
and the before-shots artifact serves.

### Phase 1: The words

Depends on phase 0.

- [x] (2026-11-13) `CONTEXT.md`: the entries `DECISIONS.md` lists under "For the plan"
  - Cancel and Undo.
  - Selected for marked.
  - Waiting to send for pending.
  - Rejected and abandoned for a delivery.
  - Unavailable, unusable and stranded.
  - Where the status line is.
- [x] (2026-11-13) Commit

**Verify**: every term in `DECISIONS.md`'s "Words for states" and "Rejected and unavailable"
either is in `CONTEXT.md` or is the shell's own wording for a term that is.

### Phase 2: Tokens, faces, icons and the pieces

Depends on phase 1.

- [x] (2026-11-13) `styles/tokens.css` takes the design's tokens by role: ink, paper, `--off` and its line,
      band, the box grey, signal, danger, muted; the five sizes; gutter, bar and radius. Faces are
      Syne (display) and Arimo (text), self-hosted in `static/fonts/` with their licences, and
      Bricolage goes. The breakpoints are 900px (wide) and 1200px (the menu's full width)
- [x] (2026-11-13) The icon sprite, served with the app and named by role, and an `Icon` component
- [x] (2026-11-13) The pieces, in `components/primitives/`, each with its phone form and its wide form where
      it has one:
  - The docked bar and the wide toolbar.
  - The segmented choice.
  - Boxes that can all be on.
  - Radio rows.
  - The lone box.
  - The bottom sheet, which is a side panel or a dialog when wide.
  - The dialog.
  - The band heading.
  - The spinner and the pending dot.
  - The transitions they share (see Motion): a sheet rising, a panel or the drawer coming in from
    the side, a veil fading, and a row leaving.
  - A main action that cannot be taken yet: dashed, with the line above saying why.
- [x] (2026-11-13) Dark, rough: the new tokens inverted by role, every piece checked in it (see Settled)
- [x] (2026-11-13) `shell.md`: Visual direction and Tokens and themes, rewritten
- [x] (2026-11-13) Commit

**Verify**: the existing `tokens.test.ts` and the new pieces' tests pass. A scratch page or a test
fixture draws each piece in each of its states, and its shots match `css/bars.css` in the design.

### Phase 3: The frame

Depends on phase 2.

- [x] (2026-11-13) The header: title and icons for search, filter (with a count) and notices (with a red
      count). Counts come from the same rows everywhere
- [x] (2026-11-13) Navigation: the drawer below 900px, with the queue's waiting count and who is signed in. A
      column at 1200px and wider, and a rail of icons with counts from 900 to 1199px. The four
      words in the bar go
- [x] (2026-11-13) The status line, as ADR 74 has it. It sits at the foot of the queue, the feed and the log,
      only while something is true, and under the list only when wide.
  - Left: what is happening or was just said.
  - Right: "n waiting", then "Offline".
  - Cancel and Undo are underlined words, and nothing offers Cancel while offline.
  - Notices open from the line and from the bell. `notices (n) ▴` and the queue count go.
- [x] (2026-11-13) The red strip under the header, the one popup, for a delivery turned down after its window
- [x] (2026-11-13) Offline said in ink, with "as of" and the time the pool last answered
- [x] (2026-11-13) `shell.md`: The shape of the shell and The status line
- [x] (2026-11-13) Commit

**Verify**: the design's shots 01 to 06 and w01, 390 and 1440. A test drives the line through a
route in its window, a passing message, waiting work and offline, and checks that Cancel is
absent while offline.

### Phase 4: The register

Depends on phase 3.

- [x] (2026-11-13) Rows by day only, as ADR 73 has it.
  - Each day gets a sticky heading with the weekday in Syne, the date and the count.
  - The time sits in a narrow column, and the body holds the words, the link preview (not a link),
    the record lines with the end of the path, the tags and the state lines in words.
  - The rail and Appearance's `rows` setting go.
- [x] (2026-11-13) Trigger tags drawn as the route icon and the name, everywhere
- [ ] The rows' states in words, per `DECISIONS.md` "Rows" and "Words for states" *(2026-11-13: the waiting dot is in the corner; the window's line waits for phase 7, which keeps the row; a refused capture and "Rejected by Vault" on a queue row are not drawn yet)*:
  - A refused capture, kept on the device.
  - "Rejected by Vault in place".
  - A route in its window, with "Routing by Todo, list Next", the seconds and Cancel.
  - The waiting dot.
- [x] (2026-11-13) The filter as a sheet, or a panel when wide.
  - Order.
  - Tags.
  - The queue's templates band.
  - The feed's bands for what became of an item, its destination and its source.
  - The feed's order by when an item was processed.
- [x] (2026-11-13) Search in the header. "Nothing matches “words”." when nothing is found
- [x] (2026-11-13) A long list's foot: how much is shown, and Load more (see Unknowns)
- [x] (2026-11-13) Wide: rows at a readable measure, and the circle and Route on hover beside the words
- [x] (2026-11-13) The index view, kept: one line per item by day, chosen in the filter, in the spirit of the
      old one (see Settled)
- [x] (2026-11-13) `shell.md`: The row, Draining and the list sections
- [x] (2026-11-13) Commit

**Verify**: the design's shots 01–08, 50–52, w01 and w20 against the app's.

### Phase 5: Capture

Depends on phase 4.

- [x] (2026-11-13) Below 900px: the + floats clear of the status line and opens the capture page, titled
      "capture", with no placeholder and no clock. A draft kept by closing the page says so, with
      Clear. Save with nothing to send says what is missing
- [x] (2026-11-13) At 900px and wider: the box at the top of the queue, and Ctrl+Enter captures
- [x] (2026-11-13) At every width: a capture that lands out of sight says where it landed, with Show
- [x] (2026-11-13) A trigger tag added while writing asks its template's question *(in the tag chooser's own list until phase 7 builds the quick sheet)* in the quick sheet's shape,
      and says what will happen once the capture is sent. Closing the question leaves the tag off
- [x] (2026-11-13) Dropping and pasting files keep their rules
- [x] (2026-11-13) `shell.md`: Capture is the head of the queue, and Dropping and pasting files where it changes
- [x] (2026-11-13) Commit

**Verify**: the design's shots 31–36 and w07. A test checks that a draft survives leaving and
coming back, and that closing the question leaves the tag off.

### Phase 6: The item

Depends on phase 4.

- [x] (2026-11-14) Below 900px the item is full screen. At 900px and wider it sits beside the list, with its
      actions at the head of its pane
- [x] (2026-11-14) The header: back (or close when wide), the day and the time, the position, and Previous and
      Next in the morph shape. The ⋯ menu holds Edit, Copy (only where there is a clipboard and
      something to copy) and History
- [x] (2026-11-14) The bar: Discard, Done and Route
  - What it just did is said on a ruled line over the bar, with Undo.
  - Manual has Undo in its status box, and Discarded has Undiscard.
  - The status boxes stay grey while something is under way.
- [x] (2026-11-14) Editing: double tap on the words, or Edit. The field has a ruled edge and the bar is Attach,
      Cancel and Save. Leaving with changes asks, and that includes the system's back gesture
      through history
- [x] (2026-11-14) Tags on the item *(the question is still asked in the tag chooser's own list until the quick sheet)*. A trigger tag asks its template's question and locks while it counts
- [ ] The feed's item is sealed *(2026-11-14: Route says Route again; Edit does not yet say that saving makes a revision)*. Edit there says that saving makes a revision, and Route says
      "Route again"
- [ ] A refused capture's item *(not built: a refused capture lives in the outbox and has no item page; its notice keeps Copy, Edit and Delete)*: Done and Route are off, and Discard becomes Delete, which asks
- [x] (2026-11-14) `shell.md`: An item has an address, Actions and Tagging, where they change
- [x] (2026-11-14) Commit

**Verify**: the design's shots 20–30, 53, w02–w04 and w20. Tests cover back with unsaved changes
and the trigger tag's question.

### Phase 7: The quick route and the window

Depends on phase 6.

- [x] (2026-11-14) The quick sheet, a dialog when wide.
  - Templates by name and icon, with a template's question asked in the same sheet and its answers
    moving on as they are tapped.
  - More options leads to the route page.
- [x] (2026-11-14) Reaching it:
  - From the item's Route.
  - By a swipe left on a row, with 24px at each edge left to the system (see Unknowns).
  - By hovering a row and pressing Route.
  - With `p`.
- [x] (2026-11-14) A route in its window keeps its row, by hand or by trigger tag, counts down, and slides out
      when the window closes. Its three phrasings follow `DECISIONS.md`:
  - In the window.
  - Being attempted.
  - Retrying.
- [x] (2026-11-14) `shell.md`: the quick route, and the window's drawing in the row and on the line
- [x] (2026-11-14) Commit

**Verify**: the design's shots 09–13 and w05. A test runs a route through its window, its Cancel,
and the row leaving.

### Phase 8: The route page

Depends on phase 7.

- [x] (2026-11-14) Below 900px the steps come one at a time, as ADR 72 has them *(the header's step count, and Next only for a typed answer, are not built)*.
  - Where: templates, then destinations.
  - How: action and shape.
  - Place: the tree, the derived name per ADR 68, a taken name and its sibling, and the folder mode
    only for a new note in a folder.
  - Then the check.
  - The header gives the step and how many there are. The bar is Back and Next, and Next is only
    there for a typed answer.
- [ ] At 900px and wider it is one surface, as ADR 76 has it *(2026-11-14: the old surface stands, item left and steps right; folding a pick to one row with Change, the waiting line and radio-row answers are not built)*.
  - The item on the left, with Discard and Done.
  - Every step on the right. A step that waits on an earlier one says so in a line, and a picked
    template or destination folds to one row with Change.
  - A template's answers are radio rows.
  - Route sits at the foot of the steps.
- [ ] The check:
  - Every fact opens its step, or scrolls to it when wide.
  - A place a template fixes can be changed for one route, which then carries on by hand.
  - The item's tags can be edited.
  - The preview, with Edit under it, rewrites for one route.
- [ ] Routing replaces the check in history. The routed state has Cancel inside the window, Next
      item, Route somewhere else too, Save as a template, and Open the item. A rejection after the
      window is said on the page. Done and Discard here say so on the queue's line, with Undo
- [x] (2026-11-14) `shell.md`: The process surface, rewritten as the route page *(amended, not rewritten)*
- [x] (2026-11-14) Commit

**Verify**: the design's shots 37–45 and w10–w15. Tests cover the step order with and without a
template, history after routing, and unpinning a template's place.

### Phase 9: Batch

Depends on phase 4. It can run beside phases 5 to 8.

- [x] (2026-11-16) Selecting:
  - Hold a row to start, with a one-time hint.
  - Round checks in the time column, and "n selected" in the header.
  - When wide, ctrl/cmd-click, shift-click, `space`, and `J`/`K`.
- [x] (2026-11-16) Discard, Tag and Route. They dock at the foot on a phone and sit in the header when wide.
      The feed has Undiscard
- [x] (2026-11-16) Tag: a sheet showing each tag as on all the rows, on some (a dash), or on none, with Apply
      and Undo *(a press applies at once; there is no Apply or Undo)*
- [x] (2026-11-16) Route: only templates with a trigger tag. The question is asked once, the batch is
      confirmed, and then it counts down on one line with one Cancel (see Unknowns)
- [x] (2026-11-16) `shell.md`: Marking rows for a batch
- [x] (2026-11-16) Commit

**Verify**: the design's shots 14–19 and w06. Tests cover the selection gestures and a batch
cancelled in its window.

### Phase 10: Records and the log

Depends on phase 4.

- [ ] The record page.
  - The facts use the one vocabulary (action, shape).
  - The bar holds Item, Save as template, and Open in … only where there is an address, otherwise
    Copy path.
  - Withdraw has its own band, and its dialog follows the Unknowns.
  - Pending, rejected and abandoned are each in words. A delivery that was abandoned or cancelled
    gets the log's account, titled "tried".
- [ ] The log in the new register. A batch is one row that opens in place. Reading by item and by
      batch keeps "All of the log"
- [ ] `shell.md`: The log, and the record's sections
- [ ] Commit

**Verify**: the design's shots 46 and 54–57, and w21.

### Phase 11: Settings and sign in

Depends on phase 2. It can run beside phases 3 to 10.

- [ ] The menu of sections, each section a page in a readable column, and the menu column when wide
- [ ] Forms.
  - An unset field shows its default as picked (ADR 75).
  - Save is always "Save", and says what is missing.
  - A field picked from a destination is a Browse row.
  - Long choices are rows, and destructive actions get their own band.
  - Leaving with changes asks.
- [ ] Destinations and templates.
  - "Unavailable" with the destination's reason.
  - Check again is off while offline.
  - "Unusable" for a kind the pool no longer has, and "stranded" for a template that points at it.
  - A trigger tag is drawn as on rows.
- [ ] Access.
  - Revoke inline on each token.
  - Sign out in the session's line.
  - A pool with no password, per the Unknowns.
- [ ] Appearance: only the theme
- [ ] Sign in as a page of its own: a password that isn't accepted, and the pool out of reach
- [ ] `shell.md`: Settings
- [ ] Commit

**Verify**: the design's shots 60–83. Tests cover a default drawn as picked and left unset, and
Save's reason.

### Phase 12: Keys, accessibility and finishing

Depends on phases 3 to 11.

- [ ] Keys: the existing bindings reach the new views. When wide, a button with a key shows it in
      its tooltip. Check the full list in `DECISIONS.md` "A wide window"
- [ ] Accessibility, built through every phase and checked here:
  - Rows can be focused.
  - Focus is visible.
  - Reduced motion is respected: walk every transition with `prefers-reduced-motion` on.
  - A control's edge has 3:1 contrast against what it sits on.
  - Targets are at least 44px on a phone.
  - States are said in words.
- [ ] No feature lost: walk the audit's control table and place every control, or list the
      deliberate exceptions for the developer
- [ ] `docs/design/README.md`: `mobile/` is what the shell is built against. `brief.md` and
      `redrawn/` are removed once the developer confirms
- [ ] `pnpm test:stack`
- [ ] Motion: every transition is listed in the artifact, with what it says and where the design
      drew it or where it was chosen
- [ ] Publish the before/after and the app-against-design artifacts for the developer's tuning
      step, then stop
- [ ] Commit, and open one PR for the branch (`core:open-pr`): the ADRs, the design, the reviews,
      this plan and the code together

**Verify**: the control table is placed in full. Every state in the design's `shots/` has an app
shot beside it in the artifact. `pnpm test:stack` passes.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Component tests use `@testing-library/svelte` beside the component, as the shell's tests already
do. Behaviour that already has tests in `lib/` keeps them. Where a view is redrawn over the same
`lib/` code, test what the view now decides: what it draws in each state, what a press does,
and what history does. Don't test what `lib/` already covers. The shots are not tests. They are
how a phase is checked against the design.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, work on `agent/mobile-first-rethink` in the worktree at
`~/repos/notemap-rethink` (see Settled: one branch for the redesign). Once a phase — or any sensible set of changes — is done,
check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
