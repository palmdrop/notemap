> NOTE: Temporary finds

Struck lines were carried by [shell-second-pass](plans/shell-second-pass.md) and have shipped.
The three that are not say so.

# Misc notes
- ~~There is no way to unmark a note as done. Also, a note can be marked done multiple times.~~ —
  `routing.cancel` already exists, so this is `undo` on the record and not offering `done` to an
  item that carries one.
- **Not carried.** The routing view should maybe rather be a human-readable action log with a
  "routing" filter. The user needs a way to inspect the effects of their actions. The filter would
  use the chooser from `11f`, but the log is its own change.
- ~~We need a way to copy the contents of a capture~~
- ~~Tabbing in composer works as expected when there is something to auto-complete, but when there's
  nothing, it moves focus to next input field. Not sure exactly how this should work, but it feels
  unexpected.~~ — with nothing to complete it does nothing; leaving the line is `⇧⇥` or the pointer.
- ~~Clicking an item in the feed should show the same metadata as in the queue - reuse the same row
  component, ideally.~~

# Design notes
- ~~The "zero" / empty queue info is pretty ugly. There should be no paragraph message, and no "zero"
  indicator, just an empty queue with a discrete message or icon indicating it is empty.~~
- ~~Dropdown are native to the browser. We should use our own dropdowns so they can be stiled
  properly. A simple grid-like structure in the same style as the rest of notemap is appropriate.
  Update for newest/oldest ordering, tag picking,~~
- **Not carried.** Editing does not allow attaching anything. It is the edit surface rather than the
  row, and wants designing on its own.
- **Not carried.** Tag picking is still free entry beside a datalist rather than the shell's own
  chooser, which the order control now uses. The idiom exists; converging the two is a change of
  its own, tagging having free entry to keep.
- ~~On the item row metadata, "edited" when there is no edits shows too long a message. Should we even
  show the field if there is no edit?~~
- ~~On "payload" in the item row, does the user care? they can see the payload in the capture itself.
  Remove.~~
- ~~In the item view, the routing record link shows destination->action->"delivered". Not that
  informative. Remove "delivered", user understands that from the successful record. Change "action"
  to a path or other indicator, whatever the destination advertises, so that the user can quickly get
  a sense of where the item went.~~ — `placeIn()` in `lib/routing.ts` already computes the pointer.
- ~~Too many buttons on the item row. We need to consider a way of collapsing a few, moving them,
  hiding them or maybe using a dropdown menu. Not sure.~~ — two aligned lines, by what they do.
- ~~Composer changes size a lot when the user is typing, which is jarring.~~ — a floor under the tree,
  and a modal that stops being vertically centred.
