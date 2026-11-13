# Decisions from the design reviews

Taken with the developer after the reviews of 2026-11-09 and 2026-11-13. What is drawn follows
them; what is left open, and what the plan has to carry into the notemap repo, is at the end.

## Settled

- **Status line.** A ruled line at the foot of the queue, the feed and the log, there only while
  something is true. On the left, the newest thing happening or just said: a route in its window,
  counting, or a passing message such as "Routed to todo.md in Vault". On the right, what is true,
  counted in words, in a fixed order: "2 waiting", then "Offline". Tapping it opens the notices,
  above it; tapping again closes them. The + floats clear above where the line goes, a few pixels
  between, and stays there when the line is gone.
- **Cancel, not Undo,** for a route still in its window; Undo stays for a discard or a manual mark
  just made. The control is quiet: underlined text, not a pill. Cancelling needs the pool, so
  offline nothing offers it: not the line, not the row, not the notices.
- **A route in its window** keeps its row, hand route or trigger tag alike: "Routing by Todo list
  Next", the seconds left, Cancel. The row slides out when the window closes. An answer is drawn
  as a label and a value, never as a second name.
- **The window's three steps** have three phrasings: in the window, "Routing by Todo, 4s,
  Cancel"; being attempted, "Sending to Vault", with nothing to offer; retrying, "Waiting for
  Vault", with Cancel.
- **One popup.** Only a delivery turned down after its window gets a strip, red, at the top under
  the bar, said once. The row says it too, and the notices keep it.
- **Rows.** A rejected one says "Rejected by Vault in place" in red; a capture the pool refused
  says "Refused by the pool" and why, kept on this device until changed or deleted. A delivered
  route takes no room in the queue; the feed keeps its record line, which keeps the end of a path
  (`…/name.md`). The waiting dot stays in the row's corner. A link preview on a row is not a link.
- **A new capture** lands at the end of the queue when the oldest come first, out of sight, so
  the line says "Captured, at the end of the queue" with Show.
- **Trigger tags** are drawn as the route icon and the name, without `#route/`, everywhere: rows,
  the item, the offer list, the templates list, a template's page (with the full name under it).
  A trigger tag whose template asks something asks it as the tag is added, in the quick sheet's
  shape, in the item view and on the capture page; closing the question leaves the tag off. Once
  it lands it starts the window and is locked while it counts.
- **Words for states.** Every state has words; icons only support them. "Queue is empty." for the
  drained queue. "Manual: processed by hand", not "Done, by hand". "Must exist", not "Refuse".
  "Attachments only", not "Pictures only". "Waiting to send", "n waiting" on the line. "Selected",
  not "marked". "Nothing matches “zebra”." for a search that finds nothing.
- **Rejected and unavailable.** A destination check that fails is "unavailable", with the
  destination's reason. A delivery the destination turned down is "Rejected by Vault"; one given
  up on after retries is "Not delivered", abandoned on the record. A destination of a kind the
  pool no longer has is "unusable", and a template pointing at it is "stranded".
- **Offline is not a failure.** It is said in ink, with when the pool last answered; a state read
  before it went out of reach says "as of 12:31".
- **Green** means delivered or available, nothing else. A route in its window, a pending record,
  a fresh token: grey, the box colour.
- **Spinner** for anything under way: a route in its window, sending, retrying. The pending mark
  is the dot. The spec's stepping and quartered squares are dropped.
- **Leaving an edit** with changes asks "lose your changes?": Keep editing / Lose changes. The same in
  the item view and in settings forms, and for the system's back, the commonest way out on a phone.
- **Item view.** Edit stays in the ⋯ menu and on a double tap on the words: no pencil in the
  header. The edit field has a ruled edge and the bar has Attach. Its Previous and Next keep the
  morph shape. Route opens the quick sheet, whose More options leads to the route page. What it
  just did is said on a ruled line over its bar, with Undo, not in a toast. Manual has Undo in its
  box, as Discarded has Undiscard. In the feed every item is sealed: Edit says that saving makes a
  revision.
- **Capture page.** Titled "capture": no placeholder, no clock, since the capture is stamped
  when it is sent. A draft kept by closing the page is said, with Clear. Save, pressed with
  nothing to send, says what is missing.
- **A main action that cannot be taken yet** stays in its place, dashed, and the line over the
  bar says why ("Name it to save.", "Pick a destination to save.").
- **Route page.** No trail of steps at the foot: the header says which step of how many, the bar
  is Back and Next (Route at the check). A question's answers move on as they are tapped, with a
  chevron; Next is there only for a typed answer. Every fact on the check opens its step; a place
  a template fixes can be changed for one route, which then carries on by hand. The check edits
  the item's tags. The rewrite for one route is "Edit", under the preview. Routing replaces the
  check in history: back leaves for where the route began, and only Cancel, inside the window,
  steps back. Done and Discard on the route page say so on the queue's line, with Undo.
- **One vocabulary** for a route, on the route page, a template and a record: action (new note,
  append, new block) and shape (raw, list, task).
- **Derived file names** follow ADR 68: a slug cut at a word near 40, and a taken one takes the
  first free sibling (`-1`), never appended to. A typed name that is taken is offered the sibling.
- **Folder mode** is drawn one way, radio rows with a line each, and only where the place is a
  new note in a folder.
- **Bands for groups of rows,** plain labels for single fields.
- **Long choices are rows**, not toggles: a heading to append under, a folder mode, a quick
  route's answers, a template's destination.
- **Record.** The bar holds the everyday ways (Item, Save as template, and Open in … only where
  the record has an address; otherwise Copy path). Withdraw has a band of its own under the
  words, saying what it does, and its dialog says what the destination answered. A delivery that
  was abandoned or cancelled left no record: its page is the log's account, titled "tried".
  Settings do the same for Disable, Delete and Remove.
- **Batch.** Selecting starts by holding a row, said once the first time ("Hold a row to select
  several"); there is no menu for it. Round checkboxes in the time column; the bar becomes "n
  selected"; Discard, Tag and Route dock at the foot. Route offers only templates with a trigger
  tag, asks its question once, confirms ("route 3 with todo, list Next?"), then counts the batch
  down on one line with one Cancel. Tag opens a sheet of every tag the rows have or could have,
  each on all, on some (a dash) or on none. The feed's bar has Undiscard.
- **The log** draws a batch as one row, which opens in place to what it did, and reads by it
  (`?batch=`, "this batch", with All of the log), as it reads one item's history.
- **The feed's filter** has bands for what became of an item, its destination and its source, and
  orders by when it was processed too. The queue's has a templates band. Search marks what it
  found.
- **A long list** says how much is shown, with Load more; out of reach, the rest is with the pool.
- **Settings forms.** A choice left unset shows the kind's default as picked; there is no "default (x)"
  option. A field picked from a destination is a Browse row that opens its list in place. Save is
  always "Save".
- **Access.** Revoke stays inline on each token, a beige box in red; Sign out is a beige box in
  the session's line. A pool with no password says so, with Set a password. Sign in is a page of
  its own.
- **Lone actions** in a page (Check again, Reclaim, Edit under a preview, More options) are beige
  boxes in the page, not alone in a bar. Check again has a refresh glyph and is off offline.
- **Blocks** for actions and choices. An action bar is beige, docked at a page's foot under a rule: the
  main action a wide filled block, the others icon over word, no box. One choice of a few is a
  beige segmented row, the chosen part filled. Choices that can all be on (filter tags, Ask each time)
  are beige boxes of their own, filled and ticked when on. Every other button is a beige box.
- **Three surfaces, and a grey for what is under way.** Beige (`--off`) for what can be pressed;
  grey bands for headings; white with a rule for what is read. The box grey (`--tag`) is kept for
  routing records, pending actions and state boxes: "Routing by Todo", "On its way". The chip grey
  is gone, but for the + button.
- **The morph shape** stays only on Previous and Next in the item; the other six variants stay in
  `morph.html`.
- **No dots as separators.** Words ("Rejected by Vault in projects/street/", "todo.md in Vault")
  or space ("check   3 of 3") instead.
- **Header** is icons: search, filter (with a count), notices (with a red count). Counts come from
  the same rows everywhere.
- **Notices** under a heading say only the time and the words; the session's list is "this
  session"; Copied is said on the line, not kept. A refused capture's notice opens its row.
- **Drawer** is navigation, waiting count and who is signed in: no cards.
- **Queue order** defaults to oldest first, as CONTEXT says. The feed and the log default to
  newest first.
- **The display face** is Syne, upright, for headings, bands and titles only. The others are gone.
- **Appearance** keeps only the theme. Dark is offered and not drawn yet.
- **Out of scope here.** Accessibility depth (a section of the plan, built in rather than added
  later: focusable rows, focus styles, reduced motion, a 3:1 edge on controls, 44px targets), and
  anything about the correctness of data.

## The wide queue, a draft

Set aside for now, to come back to later in this session. The queue alone, on a window 900px and
wider without the phone frame (`?frame=full`). The phone layout is unchanged below that.

- The menu is a column of its own, always there; the drawer's footer stays in it.
- The bar is one line: the title, the search always open, filter and notices.
- A box to write in sits at the top of the list instead of the + button; Ctrl+Enter captures.
- Rows keep a readable measure. Hovering one shows the circle to select it and Route, which opens
  the quick route as a dialog.
- An opened item sits beside the list from 1200px, and over the list's right side below that.
- Filter and notices open as panels at the right. The status line runs under the list only.
- Keys: j and k (or the arrows) move between rows, and move the opened item with them; Enter
  opens; r routes; / searches; c writes.

Known from the second review, not yet acted on: between 900 and 1199 the opened item covers the
list (three columns with an icon rail was recommended); Route sits far from the words and the
batch bar overflows at 1440; a capture written in the box lands out of sight; the spec's marking
keys are not bound; the feed and settings need drawing in the frame before a plan for wide.

## For the plan

Suggested order: the ADR, then CONTEXT, then shell.md by section, then the code, a surface at a
time, the queue and the item view first. The wide frame is a plan of its own.

- **A new ADR superseding 46, 52 and 54.** ADR 46 says one face and one size, ink on white, no
  grey or green, and processing as one surface; 52 makes "by day" a choice; 54 shapes the status
  line. The new one states blocks, beige and bands, the three surfaces and the box grey, two
  faces (Syne for headings), sizes, docked bars, sheets, the drawer, the full-screen item, the
  route as steps, and what green and red mean.
- **CONTEXT.md.**
  - Undo: Cancel is the shell's word for a route in its window; Undo stays for a manual mark and
    a discard just made.
  - Marked: the shell says "selected".
  - Pending: the shell says "waiting to send", as discard stands for archive.
  - Delivery: add "rejected", said of a delivery the destination turned down, abandoned at once,
    and "abandoned", said of one given up on. Under Accept / Reject, note that rejected is also a
    delivery's outcome. Under Refused, change the avoid note from "reserved for suggestions" to
    "a destination's answer, not the pool's".
  - Destination: "unavailable" for a failed check, "unusable" for a kind the pool no longer has;
    a template on an unusable destination is "stranded".
  - Status line: at the foot of the queue, the feed and the log, not every surface.
- **docs/specs/shell.md.**
  - The shape of the shell: docked bars, sheets, a drawer, a full-screen item view; navigation is
    the drawer, not four words in the bar.
  - Capture is the head of the queue: on a phone, the + and a capture page; the box at the top
    only on wide. No stamp, no placeholder, as the spec already says.
  - The row; Marking rows for a batch: hold to select, round checks in the time column, the
    batch bar, Route by a trigger-tag template asked once and confirmed, the Tag sheet.
  - The status line: only on queue, feed and log, only while something is true; left what is
    happening, right counts in words; no Cancel offline; no notices ▴ (the bell replaces it); no
    queue count.
  - Reachable, pending, refused: the pending mark is a dot; anything under way is a spinner; the
    Asking and Pending paragraphs' squares go.
  - Settings (around line 2900): there is no `default (none)` option, read off the schema's
    `default`; the default is drawn as picked, and the field stays unset until another is
    chosen. What changes is only what is drawn; what an untouched field sends does not. The
    cost: once something else is picked, going back to the default pins it rather than unsetting
    it. Also: destructive ways in bands; "unavailable" for a failed check; Save with a reason.
  - The process surface: steps instead of one surface; the preview shown on the check, not asked
    for; the tags section kept, on the check.
  - Visual direction; Tokens: the new tokens by role (`--off`, band, the box grey, signal,
    danger).
- **Accessibility**, as its own section of the plan (see Out of scope above).
