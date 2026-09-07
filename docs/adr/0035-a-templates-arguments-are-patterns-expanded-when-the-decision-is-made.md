# 35. A template's arguments are patterns, expanded when the decision is made

**Date**: 2026-09-05
**Status**: Accepted — extends [ADR 34](0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A template that files every capture at one fixed path is nearly useless: `create-file` refuses the
second one and `append-to-file` puts them all in one note. What makes a template worth saving is
that part of the place is derived — `research/2026-09-05.md`, where the date comes from the
capture rather than from the person.

Arguments today are a `JsonObject` validated against the capability's `argumentsSchema`, stored on
the routing record, and handed to the adapter. Nothing anywhere derives one.

So: what may a template's arguments say beyond a literal value, who turns that into the value the
adapter is handed, and when?

---

## Decision drivers

- **A routing record must name a place a person can read.** The used-before list, the pointer, the
  log and the settings check all read records. A record whose path is `{{captured_at}}.md` is a
  record that answers nothing.
- **A template can fire with no shell present.** A trigger tag on a source-supplied capture is
  resolved by the daemon at three in the morning, so an expander that lives in the UI is an
  expander that is not there when it is needed.
- **Two implementations of one conversion drift.** `preview` and `deliver` already share this
  hazard and the port says out loud that it cannot enforce agreement. Do not manufacture a second
  instance of it.
- **A derived filename has a timezone problem.** `Timestamp` carries no zone. A capture made at
  half past ten on a Swedish evening is the following day in UTC, so `{{captured_at}}` filed under
  UTC is the wrong day for exactly the person who cared enough to configure it.
- **Anything core learns to parse, core owns forever.** A language accepts input, refuses input,
  gains a version, and has to be explained.

---

## Considered options

1. **The shell expands, and stores literal arguments.** Core never learns what a pattern is.
2. **Core expands when the decision is made.** The record stores concrete arguments; the adapter
   sees exactly what it sees today.
3. **The adapter expands at delivery.** The pattern is stored on the record and resolved against
   the item when the delivery runs, on the terms
   [ADR 31](0031-the-adapter-decides-create-or-append-at-delivery.md) already set for
   create-or-append.

---

## Decision outcome

Chosen: **option 2**. A template's string arguments may hold patterns; **core expands them at the
moment the decision is made**, validates the result against the capability's `argumentsSchema` as
it validates anything else, and stores the concrete arguments on the record. A pattern never
reaches an adapter and never reaches a routing record.

**The line against ADR 31 is worth stating, because it looks like a contradiction and is not.**
ADR 31 defers to the adapter because whether a note is already there is *a fact about the
destination*, unknown to anyone until the write. A capture's date is *a fact about the item*, fixed
before the decision was made and true for as long as the item exists. So: the adapter resolves what
only it can know, and core resolves what only the item knows. Deferring the second would put a
pattern in a record and leave every reader of records holding a string that names nothing.

**The vocabulary is closed, and small.**

| Pattern | Expands to |
| --- | --- |
| `{{captured_at}}` | the capture's date, `2026-09-05` |
| `{{captured_at:date}}` | the same, said explicitly |
| `{{captured_at:datetime}}` | `2026-09-05 14-32` |
| `{{captured_at:time}}` | `14-32` |
| `{{captured_at:month}}` | `2026-09` |
| `{{captured_at:week}}` | `2026-W36` |
| `{{captured_at:year}}` | `2026` |
| `{{item}}` | the item id |
| `{{source}}` | the source id |

Bare `{{captured_at}}` means the date because a filename is the motivating case, and a bare
timestamp holds colons that are not a filename on every filesystem this will ever meet. The
`datetime` and `time` forms use `-` for the same reason.

**Formats are named, not written.** `{{captured_at:YYYY-MM-DD}}` was refused: it is a second
grammar to parse, to validate, to refuse in and to document, and it drags a date library across
core's boundary to serve a handful of shapes that were all going to be one of the seven above. A
format nobody named yet is a line in this table, which is cheaper than a language.

**Expansion is statically total.** Every field in the table is present on every item, so a template
that saved expands for any item, forever. An unknown field or an unknown format refuses the write
when the template is saved, so a typo is found by the person who typed it rather than by a delivery
a week later, and there is no second refusal at route time to design, draw or explain. There is
**no escape**, so a literal `{{` cannot appear in a template's arguments. Said plainly rather than
solved: nothing writes `{{` into a vault path on purpose, and an escape is a second grammar for a
case nobody has.

**Nothing expands to a value a person typed.** `{{tag:project/}}` — the first tag under a namespace,
which would let one template serve every project — was considered and dropped. Every field in the
table expands to something whose shape core controls: a date it formatted, an id it minted. A tag is
free text and may hold a slash, a colon or a space, so that one pattern would put unsanitised input
into a filesystem path, and a sanitisation rule is a promise a template would then be making about
every filesystem it ever meets. It also buys less than it looks: it trades one template per project,
made once, for a second tag on every capture. The alternative — refusing a route because of how
somebody typed a tag weeks ago — spends a delivery failure on a naming accident.

**Nothing is drawn from the payload.** No title, no first line, no excerpt. `core.md` has held
*what a destination names a file when the domain has no title* open since 2026-08-13, and its own
answer is that a title is plausibly an artifact an enrichment produces. A template deriving a title
by its own rules would settle that question sideways, badly, and permanently. A template answers
the filename question for the person who configured it; the general question stays open and gets a
better answer later.

**A capture records the UTC offset it was made at.** The browser knows it exactly, DST included, so
this is one number carried from where the truth is. It is **optional**: a source-supplied capture
has no offset to give, and neither does one made by something that is not a browser. The mirror
record carries it, which is what keeps a rebuilt pool expanding dates the same way.

**The fallback is the host's, and is never a silent UTC.** Where a capture carries no offset, the
zone comes from the daemon's configuration and is supplied to core beside the clock, on the terms
`core.md` already sets for operational knobs — a grace window, a retry bound, a zone: things the
host owns and core does not invent. The two shapes are deliberately different: a capture carries an
**offset in minutes**, being a fact about one moment, and the host names an **IANA zone**, being a
rule about all of them.

**Why not option 1.** A trigger tag fires with no shell in the room. It also puts the expander in
the one place that is guaranteed to have a second copy the day something else routes.

**Why not option 3.** It stores a pattern where a place belongs, which breaks the used-before list,
the pointer, the log and the settings check in one move, and it hands every adapter a language to
implement.

### Consequences

- **Good** — the record says `research/2026-09-05.md`, so everything that reads records keeps
  working with no knowledge that a template exists.
- **Good** — the shell can show the expanded arguments before the commit, because it asks core to
  resolve a template against an item and draws what comes back. One expander, drawn rather than
  reimplemented.
- **Good** — a template that saved will expand, for every item, with no second refusal at route
  time. The composer has no *this template cannot apply to this item* state to draw, and the
  template's report has no such branch.
- **Bad** — the capture path, the domain type, the mirror record and its parse, the HTTP capture
  body and the client's outbox all gain a field, for a feature that is about filenames. It is the
  only place the truth about the zone exists, so it is the only place it can come from.
- **Bad** — a literal `{{` is unwritable. Accepted.
- **Neutral** — two captures on one date collide, and what happens then is the capability's
  business exactly as it is today: `create-file` refuses, `append-to-file` and
  `create-or-append-file` add to the note. A daily note that grows through the day is the case this
  makes easy, and it needs no new rule.

---

## Prior decisions this rests on

- [ADR 31](0031-the-adapter-decides-create-or-append-at-delivery.md) — the line this ADR draws
  itself against: the adapter decides what only it can know.
- [ADR 15](0015-the-mirror-record-is-authoritative-markdown-is-a-rendering.md) — the capture's
  offset is mirrored material, so losslessness is what proves it round-trips.
- [ADR 33](0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md) — the
  two-implementations-drift hazard, named there first.

## More information

Revisit when a title becomes an artifact: `{{title}}` is the pattern this table is deliberately
missing, and the day an enrichment produces one it is a row here rather than a new mechanism. It
arrives with the same problem `{{tag:}}` was dropped over — a value core did not shape reaching a
path — so whichever of the two comes first is what settles the sanitisation rule for both.
