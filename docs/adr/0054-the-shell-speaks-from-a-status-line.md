# 54. The shell speaks from a status line, and a fired template counts down

**Date**: 2026-09-30
**Status**: Accepted. Amends [ADR 46](0046-the-shell-is-one-face-one-size-ink-on-white-and-processing-is-a-surface.md)
on the chrome ("the bar is `queue · feed · log · settings` and one status glyph") and
[ADR 37](0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md) on the
window's visibility ("no countdown, no bar"). Supersedes the corner, which shell.md settled on
2026-09-03 and amended since; [shell.md](../specs/shell.md#the-status-line) now describes the
status line in its place. Everything else in both ADRs stands.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

The shell says what is true of itself in two places. One is a glyph at the bar's right: `●` the
pool answers, `○` it does not, `◐` this device holds work the pool has not seen, with the count
only in its title. The other is the corner, bottom left: notices rise into it, confirmations fade
out of it, and failures stand until a person dismisses them. The corner holds four and counts the
rest.

After living with both, the developer found gaps that neither place can fill:

- **Nothing shows everything in flight at once.** A row says `pending` while it is looked at, and
  the glyph turns half-full, but how much is waiting, and what it is, needs a hover over an 11px
  circle.
- **A notice that has gone cannot be read again.** A confirmation leaves after four seconds, and a
  failure that is dismissed is gone, so the only way back to what was said is the log, which holds
  the pool's account and not the shell's.
- **A fired template gives no sense of time.** `routing · research` stands with a `cancel` for a
  window nobody can see, and after the window it goes on saying the same thing while the delivery
  is being attempted. The todo "routing by trigger tag stays pending for too long" is this: the
  person cannot tell waiting-to-cancel from waiting-on-a-destination.
- **Why a delivery failed was lost.** It is fixed separately, but it was lost because the corner
  kept one notice per firing and the last word replaced the one that carried the reason.
- **Nothing says how much is left to do.** The queue has no count, and the pool offers none.

The developer asked for a status line: vim's, stuck to the bottom of every surface, carrying the
statistics, the pending work, and the shell's messages.

---

## Decision drivers

- **One place for the shell's own voice.** The corner was chosen over a second corner for this
  reason, and it still holds: a status line beside a corner would be two places to look.
- **Stated once.** Reachability and pending work were each made to say themselves once, in the
  chrome. Moving them must not make them twice.
- **Asking stays where the answer lands.** The asking mark takes the place its answer will. A
  global spinner for every read is what that rule exists to prevent.
- **A phone has 375px**, a keyboard that covers the bottom of the screen, and a safe area.
- **Endless scroll** reads the next page when the list's foot comes near. A bar fixed over that
  foot must not hide it from the reader or from the observer.
- **A countdown must be measured, not invented.** ADR 37 rejected one because the shell did not
  know when the window closes. If the shell is told, a countdown states a fact.

---

## Considered options

1. **Keep the corner, add a bar** for the glyph, the counts and in-flight work. Notices stay in
   the corner.
2. **A status line replaces the corner and the glyph.** One line at the bottom: the newest notice
   on the left, counts and in-flight work on the right, and a panel that opens above it holding
   this session's notices and everything in flight.
3. **A notices page**, reached from the bar, holding the history. The corner stays as it is.

---

## Decision outcome

Chosen: **Option 2**.

**The status line** is one ruled line fixed to the bottom of every surface, in the page's column,
at the shell's one size.

- **The left is the message line.** It holds the newest notice still live: a confirmation for as
  long as it would have lingered in the corner, and a standing notice until it is dismissed. It
  says the notice's first line and its reason on one line, cut to fit, and whatever the notice
  offers (`undo`) beside it; `look` is in the panel. An alarm is in the accent. Nothing leaves while the pointer or
  focus is on the line or its panel, as in the corner.
- **The right is the counts**, each drawn only while it is true, in a fixed order: firings still
  open (`routing · research 12s` with `cancel`), work this device holds (`3 pending`), what stands
  to be cleared (`2 to clear`, in the accent: standing alarms and refusals), the queue's size
  (`14 in queue`), and reachability (`●`, or `○ offline`). The glyph's third state, `◐`, goes,
  because the pending count says it in words.
- **The panel** opens above the line from a press on it, or `n`, and closes on `esc` or a press
  outside. It lists this session's notices oldest first, so the newest is nearest the line, and
  then everything in flight: open firings with their countdown and `cancel`, the operations this
  device has not sent, and refusals with `dismiss`. A notice keeps its offer only while it is live.
  The panel's head leads to the log, which is where the whole of it is.
- **Below `narrow`** the line keeps the message, and the counts drop their words to a number and
  a mark. The panel is full width.

**Firings leave the notices.** A fired template is not something that has happened, so it is
drawn with the work in flight and not as a notice. It opens when the shell tags or when the log
says `template-fired`, and closes when the log says the record landed, failed, was given up on, or
was cancelled. What happened then is a notice as it always was.

**A fired template counts down.** `template-fired` carries `until`, the instant the window closes,
which is the `notBefore` the pool already gives the delivery's job. The firing draws the seconds
left and its `cancel`. When the window closes the countdown gives way to the asking mark: the
delivery is being attempted and `cancel` is still real, since a pending record can be cancelled
until it resolves.

**The pool answers its counts.** `GET /v1/counts` answers `{ "queue": 14 }`, the number of items
the queue holds. It is a separate route rather than a field on each page because the status line
needs it on every surface, not only where the queue is read. The client reads it again when its
own work drains, when the log shows the pool did something, and when the pool comes back.

> **Amended in review, 2026-10-01.** Nothing stands and nothing is dismissed. Every notice goes on
> its own, what went wrong after ten seconds, and `to clear` is gone: `notices` counts, in the
> accent, what went wrong since the panel was last opened, and opening it is the whole of
> acknowledging it. A refusal is said once as a notice and the client is told to let go of it. The
> line says a failure in a few words — `retrying: <reason>` where the pool will try again, and
> `routing failed: <reason>` where the route ended — and leaves the place, the code and the capture
> to the panel. The panel hangs from an always-present `notices` at the line's left, at most 28rem
> wide, slides open, and stands clear of the line's rule. The developer's reasoning: once a notice
> can be read again in the panel, asking somebody to clear it costs a gesture and buys nothing.
>
> Later the same day: reachability says nothing while the pool answers and `offline` while it does
> not, the count reads `notices (1) ▴`, the line is ruled down both ends with the panel's edge on
> its own, and an `undo` taken back elsewhere leaves the line.

### Consequences

- **Good**: work in flight, what stands, and how much is left are all stated in words on every
  surface. A notice can be read again after it has gone.
- **Good**: the corner's rules for holding four and trimming the oldest are gone. The history has
  room for everything, and the message line has room for one.
- **Good**: a fired template says how long is left to call it off, and says when it has moved on
  to the destination.
- **Bad**: a bar fixed to the bottom costs a line of every screen, and on a phone it sits under
  the keyboard while a field is being written.
- **Bad**: a notice was up to three lines in the corner and is one line in the status line. The
  capture's excerpt and a long path are read in the panel. This is the reverse of 2026-09-03's
  "a notice is more than a word", and it is taken because the panel is one press away.
- **Neutral**: the history is the session's and in memory. A reload empties it, and the log is the
  durable account.
- **Neutral**: the list's foot still says, where `load more` would be, that more comes when the
  daemon answers. The status line says the pool is offline; the foot says what that costs the list
  in front of the reader, which the line cannot. Endless scroll is unchanged: the page's foot is
  padded clear of the line, so the foot the observer watches is also one the reader can see.

---

## Pros and cons of the options

### Option 1: keep the corner, add a bar

- **Good**: notices keep their three lines.
- **Bad**: two places at the bottom of the screen, and a failure in one while the count in the
  other says `1 to clear`. This is the second corner the 2026-09-03 decision rejected.

### Option 2: a status line

- **Good**: one place, on every surface, with room for counts and a history.
- **Bad**: the notice is shortened to a line, and the bar takes screen height.

### Option 3: a notices page

- **Good**: the least new chrome.
- **Bad**: it answers "what was said" and nothing else. In-flight work and counts still have
  nowhere to be.

---

## More information

- Plan: [status-line](../plans/status-line.md).
- Spec: [shell.md](../specs/shell.md#the-status-line), [http-v1.md](../specs/http-v1.md#counts),
  [client.md](../specs/client.md).
- Todo: the shell's "bottom bar with info, like a vim statusbar", "statusbar should show indicators
  of pending actions", "statusbar with statistics", and "no good way to see pending operations".

Revisit if the panel goes unopened. If nobody reads back, the history is not earning its code, and
the message line alone is the smaller answer.
