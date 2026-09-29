# Rows by day

**Date**: 2026-09-29
**Status**: In progress
**Spec**: `docs/specs/shell.md`
**Closed**:

---

## Goal

> The queue and the feed, in the timeline and the index alike, can be read **by day**: a sticky
> heading per day (the date bold, the weekday beside it, ruled under) with each row keeping only
> its time. A reader chooses it in Appearance as `rows: auto · by day · rail`, held on the device.
> `auto` is the default: by day below `narrow`, today's rail above it.

Design: turn 4 of `Days.dc.html` in the Claude Design project *notemap shell — redrawn*. 4c is by
day below `narrow`, 4d is by day above it, and 4e is the setting.

---

## Tasks

### Phase 1 — the choice

Depends on nothing.

- [x] Branch `agent/rows-by-day`. _(2026-09-29)_
- [x] A reading of the choice beside `theme`: `auto | by day | rail`, stored in the browser under
      its own key, `auto` when nothing (or nothing known) is stored. It answers two things a
      surface asks: whether it reads by day, and whether the rail is **slim** (by day below
      `narrow`). The width is read reactively, from the same `--breakpoint-narrow` that
      `breakpoint.ts` names.
- [x] Appearance draws a `rows` fact under `theme`, with the three options in `theme`'s idiom: the
      chosen one bold, `aria-pressed`, one press to choose.
- [x] Tests: the default, a choice surviving a reload, an unknown stored value falling back to
      `auto`, and the two answers at both widths for each choice.
- [x] Commit. _(2026-09-29)_

**Verify:** `pnpm --filter @notemap/ui test`. The fact is drawn at `/settings/appearance`, and a
choice survives a reload.

### Phase 2 — days, headings, a time-only stamp

Depends on nothing. Phases 3 and 4 depend on it.

- [x] A pure function turning a list of items into the list a register draws: a day heading
      before the first item of each local day, in whatever order the list is read, with keys that
      stay stable while rows come and go.
- [x] `stamp.ts` names a weekday, local, lowercase: `sunday`.
- [x] A day heading primitive: spans the register, sticky at the top of the page, on the ground
      colour, ruled under, with the date bold and the weekday beside it. No month heading.
- [x] The stamp can draw its time alone. Doing so, it still says the whole date and time to
      assistive technology, so a row selected by its stamp keeps a full name.
- [x] A token for the slim rail's width, which holds a time and nothing more.
- [x] Tests: grouping in both orders, across a day boundary and within one day, with a held row
      inserted; the weekday; the time-only stamp's accessible name.
- [x] Commit. _(2026-09-29)_

**Verify:** the unit tests pass, and `tokens.test.ts` stays green.

### Phase 3 — the timeline by day

Depends on 1 and 2.

- [x] The register takes the slim rail's column when the rail is slim.
- [x] A row read by day draws its stamp as the time alone. When the rail is slim, everything else
      the rail held (state word, `pending`, tags with their `+`, the routing line, a refusal) opens
      the body instead, above the capture, so the rail holds the time and nothing else.
- [x] The first row under a heading lays its top edge on the heading's rule, one pixel up. It does
      this whether or not it is selected, so a selected first row draws one line, not two. No
      logic depends on which row is selected.
- [x] A row brought into view by `j`/`k` clears the sticky heading rather than landing beneath it.
- [x] The queue and the feed draw headings between their rows when read by day. A heading slides
      in and out with the rows it heads, on the same terms rows move by.
- [x] Tests on the queue and the feed: headings drawn by day and not on the rail; a heading goes
      when the last row of its day leaves; the first row under a heading is marked for the
      overlap; the slim row carries its tags in the body; `j`/`k` and the held row still work
      across a heading.
- [x] Commit. _(2026-09-29)_

**Verify:** tests pass. In a browser at 390 and 1440, with each choice: headings hold while
their day scrolls; a selected first row draws one rule; nothing in the row moves when it is
selected.

### Phase 4 — the index by day

Depends on 1 and 2.

- [x] The index draws the same headings when read by day, each line keeping only its time. The
      half-day gap is not drawn by day: the heading already says that a day passed.
- [x] A line brought into view clears the sticky heading.
- [x] Tests: headings and time-only stamps by day; the gap by the rail and no gap by day.
- [x] Commit. _(2026-09-29)_

**Verify:** tests pass. In a browser, the index at 390 and 1440 reads by day.

### Phase 5 — docs

Depends on 3 and 4.

- [ ] A new ADR: reading by day is a reader's choice, and the shell keeps two register layouts.
      It amends ADR 46's "one layout", which it names, and states the cost plainly: every change
      to a row is now built and checked in both layouts. ADR 46 gets a superseding note pointing
      at it rather than an edit.
- [ ] `shell.md`: the shape of the shell, the row, the index, and Appearance under settings
      describe the choice and both layouts. Add a Shipped entry.
- [ ] `docs/todo.md`: tick the mobile-layout item.
- [ ] Typecheck, lint, `pnpm -r --silent test`.
- [ ] Commit, and open a PR.

**Verify:** the checks are green, and the spec and the code agree.

---

## Unknowns

- **Stickiness inside the grid.** The register is one grid with rows as subgrids, so a heading
  sticks against the whole register rather than its own day, and the next heading slides over it
  rather than pushing it out. The design draws the same thing and it reads fine. Fallback: wrap
  each day in a block of its own. That breaks the subgrid that keeps the columns in register, so
  it is taken only if the overlap reads wrong.
- **`matchMedia` in tests.** jsdom has none. _Answered 2026-09-29: the width is read from
  `innerWidth` on `resize`, as `breakpoint.ts` already does, so the test harness's `viewport()`
  drives it and nothing needs stubbing._
- **Motion around headings.** Rows slide in and out under `moving`. A heading entering or leaving
  with them might jump where a row slides. Fallback: headings fade instead of sliding.
- **Scroll restoration.** The place kept for a reload is a scroll offset. Headings change the
  page's height when the choice changes, so a place kept under one choice lands elsewhere under
  the other. This is accepted: the choice changes rarely.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

jsdom draws no layout, so the pixel overlap and the stickiness are checked in a browser. The tests
assert the structure that produces them.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
