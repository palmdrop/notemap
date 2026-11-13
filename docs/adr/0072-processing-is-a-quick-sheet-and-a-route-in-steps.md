# 72. Processing is a quick sheet and a route in steps

**Date**: 2026-11-13
**Status**: Accepted. Supersedes the processing tiers of
[ADR 46](0046-the-shell-is-one-face-one-size-ink-on-white-and-processing-is-a-surface.md): the
row's ruled strip and the process surface as one page.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

ADR 46 gave processing two tiers. The first is a strip on the selected row (`process · manual ·
discard · tag`), where a template is reached through `tag`. The second is a surface,
`/items/{id}/process`, with the capture at a fixed head, collapsible sections for destination,
place, rewrites, tags and preview, and `route` at the foot. On a phone the strip is a row of words
in the body's size. The surface asks the reader to scroll past every argument and to remember
which tag fires which template. The audit counted the taps and the reading for both routes by
template and by hand. Each was the slowest step in its task.

How is an item processed when the shell is drawn for a phone first?

---

## Decision drivers

- **The quick case must stay quick.** Discard, manual and routing by a template are one or two
  presses, and none of them makes you leave the list for long.
- **A route by hand asks one question at a time.** On a phone, each argument gets the whole screen
  while it is being answered.
- **Templates are chosen by name, not remembered by tag.** A trigger tag still works. It is
  not the only way in.
- **The preview is shown, not asked for.** Before a route is sent, the reader sees what will land.
- **The window.** A decision that makes a delivery waits a short window
  ([ADR 69](0069-every-decision-that-makes-a-delivery-waits-a-short-window.md)). Whatever starts a
  route has to show the window, and a way to cancel inside it.

---

## Considered options

1. **Keep both tiers**, the row's strip and the process surface, restyled.
2. **A quick sheet, and a route in steps.** The item opens full screen, with Discard, Done and
   Route at its foot. Route opens a sheet of templates. "More options" leads to a page that asks
   where, how and which place, one step at a time, and ends on a check.
3. **The process surface as one long page on a phone**, with sections collapsed until opened.

---

## Decision outcome

Chosen: **Option 2**.

**The row.** A tap opens the item, full screen. A swipe left on the row opens the quick sheet.
With a pointer, hovering a row shows Route instead. A swipe that starts within 24px of the
screen's edge belongs to the system's back gesture, not to the row.

**The item.** Its bar is Discard, Done and Route. Done is the manual mark, and both it and Discard
have Undo in their state box. Edit is in the ⋯ menu, or a double tap on the words. While editing,
the bar is Attach, Cancel and Save. Leaving with unsaved changes asks first, and so does the
system's back gesture.

**The quick sheet** lists the templates by name and icon. A trigger tag is drawn as the route icon
and the template's name, never `#route/…`. A template that asks something
([ADR 63](0063-a-template-may-ask-for-an-argument-each-time-it-is-applied.md)) asks it in the same
sheet, and its answers move on as they are tapped. Adding a trigger tag on the item or the capture
page asks the same way. Closing the question leaves the tag off.

**The route page** asks where, how and which place, one step at a time, then shows the check. The
header says which step of how many. The bar is Back and Next, and Next is only there for a typed
answer. The check shows the preview, every fact opens its own step, and the item's tags can be
edited there. If a template fixed a place, changing it for one route turns that route into one
made by hand. Folder mode is asked only when the place is a new note in a folder. Sending a route
replaces the check in history, so going back after routing returns to where you started. Only
Cancel, inside the window, goes back into the steps.

**The window** keeps the row in the list, for a route made by hand and for a trigger tag. The row
says "Routing by Todo, list Next", the seconds left, and Cancel. When the window closes, it slides
out.

**A batch** starts by holding a row. Discard, Tag and Route dock at the foot. A batch is routed
only by a template with a trigger tag. Its question is asked once, the batch is confirmed, and
then the batch counts down on one line with one Cancel. Tag opens a sheet showing, for every tag,
whether all of the rows have it, some do, or none do.

### Consequences

- **Good**: the quick case is two presses, a swipe and a template, and its question comes in the
  same sheet.
- **Good**: a route by hand asks one question per screen and ends on a check that shows what will
  land. Nothing is hidden behind a collapsed section.
- **Good**: what the window is doing is shown on the row itself, not only on the status line.
- **Bad**: a route by hand is now several screens. A reader who knows every argument takes more
  presses than on the surface, where everything was on one page. The check, where every fact opens
  its step, makes up for some of that.
- **Bad**: a batch can't be routed by hand. A batch is routed by a template or not at all.
- **Neutral**: `/items/{id}/process` becomes the route page. Whether each step gets an address
  of its own is for the plan to decide.

---

## Pros and cons of the options

### Option 1: both tiers, restyled

- **Good**: least to build. The behaviour is already specified.
- **Bad**: the strip is words the size of the text, and a template is still found through `tag`.
  The surface is still one long scroll on a phone.

### Option 2: quick sheet and steps

- **Good**: each screen asks one thing. A template is picked by name.
- **Good**: these are the conventional patterns on a phone: a sheet, a step through, a check.
- **Bad**: more screens for a route by hand, and more state to keep across them.

### Option 3: the surface, collapsed

- **Good**: one page, as on a desk.
- **Bad**: collapsed sections still have to be opened, read and closed, and the preview is one
  more section to open. It hides the length of the form without making it any shorter.

---

## More information

- Design: `queue.html` (the item, the quick sheet, a batch) and `route.html` in
  [`docs/design/mobile/`](../design/mobile/).
- Settled detail: [DECISIONS.md](../design/mobile/DECISIONS.md), under Route page, Item view,
  Batch and Trigger tags.

Revisit if a route by hand is mostly made by people who know every answer: then the check could
open first, with the steps behind it. Revisit routing a batch by hand if routing many at once
without a template turns out to be common.
