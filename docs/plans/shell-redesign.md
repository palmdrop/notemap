# The shell, redrawn

**Date**: 2026-09-14
**Status**: In progress
**Spec**: `docs/specs/shell.md`
**Closed**:

---

## Goal

The shell is set in one face at one size, ink on white with one red, on a grid of open lists and
regional rules; processing has a quick tier on the queue row and a deep tier on a surface that
advances through the queue; and every finding in
[issues-2026-09-11.md](../design/issues-2026-09-11.md) is either built or dropped with a reason.

This is a programme rather than a slice. Phase 1 is the design work; the phases after it are
named here so the order is visible, and each is expanded into tasks when its design is settled
and not before. The direction is [ADR 46](../adr/0046-the-shell-is-one-face-one-size-ink-on-white-and-processing-is-a-surface.md);
the statement of the system is [the brief](../design/brief.md).

Nothing in phase 1 touches code. The Claude Design project is the working surface; `docs/design/`
stays the ground truth, and a page lands there — as static HTML and CSS, with shots — in the PR
that implements it.

---

## Tasks

### Phase 1 — the design phase

- [x] Branch `agent/shell-redesign` _(2026-09-14)_
- [x] Screenshots of the app as it is, every surface at 1440 and 390, replacing `docs/design/shots/` _(2026-09-14)_
- [x] `docs/design/brief.md` _(2026-09-14)_
- [x] ADR 46 _(2026-09-14)_
- [x] `docs/design/README.md` says what the directory is now: the brief, the shots of the app as it
      is, and old mockups that are wrong until each is replaced _(2026-09-14)_
- [x] A fresh Claude Design project, `notemap shell — redrawn`, holding the brief, the issues and
      the inspiration notes; images are dropped in by hand if wanted _(2026-09-14)_
- [ ] Round 1: tokens stylesheet; the queue at 1440 and 390 — capture box, collapsed rows, a
      selected row with its strip, the drained queue; the process surface — head, sections
      collapsed and open, foot, a picture capture
- [ ] Round 2: feed, item with record blocks, log with the tab row, sign-in
- [ ] Round 3: settings with its side menu, destination and template rows open
- [ ] Commit the docs; open a PR for the docs alone

### Phase 2 — tokens, face and chrome

The one face and the one size, the palette, the bar, the theme moved to settings, the order
control moved into the lists. Everything downstream sits on it. Expanded when round 1 is settled.

### Phase 3 — the queue row and the quick tier

Collapsed row, selected row with the ruled strip, the capture box, keyboard walking, `discard` and
`manual` from the row, the tag chooser as the way to a template.

### Phase 4 — the process surface

`/items/{id}/process`, the modal removed, routing advancing through the queue.

### Phase 5 — item, records and the log

The record block, inline on the item and under a routing kind in the log; the tab row; the
renames.

### Phase 6 — settings

The side menu and the five sections.

### Phase 7 — motion

The few structural transitions, after everything they move exists.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Phase 1 has nothing to test. From phase 2 on, the token gate in `apps/ui/src/tokens.test.ts` is
extended before any component names a value, and each phase's tests assert what the shell draws,
enables and disables.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
