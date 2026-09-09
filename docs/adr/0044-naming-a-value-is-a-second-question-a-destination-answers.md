# 44. Naming a value is a second question a destination answers

**Date**: 2026-09-09
**Status**: Accepted — extends [ADR 26](0026-a-destination-can-be-asked-what-an-argument-could-hold.md) and [ADR 42](0042-a-candidate-carries-both-its-readable-name-and-its-lasting-one.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

[ADR 42](0042-a-candidate-carries-both-its-readable-name-and-its-lasting-one.md) gave an entry two
names and let the template form keep the lasting one, so a template pinned to an are.na channel
holds `12345` and survives a retitle. It also recorded the cost: the form then *draws* `12345`, and
nothing on it says which channel that is. On 2026-09-09 the shell started reading the name back —
the line shows `Reading` while the field keeps the number — by looking the value up in the browse's
own answer.

That works exactly as far as the answer reaches, and the answer is one page. The are.na adapter
asks `/v3/users/{id}/contents` for a single page on purpose: are.na's guidance asks callers not to
enumerate an account. So `truncated` is not an edge case there, it is the steady state for any
account past a page — and the channel a template is pinned to is as likely to be outside that page
as in it. The form falls back to drawing `12345`, which is the symptom the work set out to remove,
on precisely the accounts big enough to have minded.

Nothing else can answer it either. `/v1/destinations/{id}/remembered` is the pool's own answer
about places and carries `value`, `uses`, `lastAt` — no label — and it reads *routing records*, so
a template saved months ago and never fired has nothing there at all.

The same question turns up in two more places, both already noted in `docs/todo.md`: the settings
**template list**, which draws saved templates without asking any destination anything, and the
**routing record**, which shows what a delivery was addressed to. One question, three callers, and
at the time of writing no way to ask it.

---

## Decision drivers

- **A browse cannot answer it.** Capping is deliberate ([ADR 26](0026-a-destination-can-be-asked-what-an-argument-could-hold.md));
  the value being named is the one a cap is most likely to have dropped.
- **The shell must not learn about kinds.** It cannot know that an are.na channel has a
  `/v3/channels/{id}` and a vault path has nothing of the sort.
- **A stale name is worse than none.** Whatever answers has to be asked now. A label kept beside
  the value would rot on a retitle, which is the exact failure `durable` exists to avoid.
- **Core must stay uninterested.** It carries the question and sorts the failures; it does not read
  what came back.

---

## Considered options

1. **A second ask** — `GET /v1/destinations/{id}/named`, one value in and one entry out.
2. **A `holds=` parameter on `/candidates`** — the browse answers its page and, where asked, the
   entry that value names alongside it.
3. **Store the label beside the value** in the template's arguments, and draw that.
4. **Leave it**, and say on the surface that the page had nothing to say about this value.

---

## Decision outcome

Chosen: **option 1**. `GET /v1/destinations/{id}/named?capability&field&value` answers
`{ kind: "answered", entry? }` on `/candidates`' own failure kinds — `unreachable`, `unusable`,
`not-offered` — and makes the same two checks before the destination is asked anything: the
capability must be declared and the field must carry `x-notemap-candidates`.

- **`entry` absent is an answer, not a failure.** A place typed by hand names nothing there. A
  destination that refused instead would make a value it delivers to perfectly well look broken,
  and ADR 42 already settled that an unlisted channel is kept as written.
- **`value` is whichever form the field ended up holding.** The composer keeps `value`, a template
  keeps `durable`, and a destination that answers for one answers for both — the are.na endpoint
  takes an id or a slug without being told which it was given.
- **A kind with no second name for a thing has no `naming`**, and the registry reports that as
  `not-offered`. That is the right answer for a vault: a path is its own name, and drawing
  something else over one would hide what is about to be written.
- **The shell asks only where the page had nothing to say**, so the ordinary channel — one the
  browse already listed — costs no request at all.

### Consequences

- **Good** — the name a template shows no longer depends on how many channels an account has.
- **Good** — the template list and the routing record now have something to call. Neither is done
  here; both are one ask away rather than blocked.
- **Good** — nothing is stored, so nothing rots. The answer is as fresh as the moment it was asked.
- **Bad** — a fourth method on the destination port, and every adapter has to decide whether it has
  one. Mitigated: it is optional, and absent is a correct answer rather than a gap.
- **Bad** — a form opening on an off-page value costs one extra round trip to a slow destination.
  It happens once per field and only where the page came up empty.
- **Neutral** — `not-offered` and "nothing by that name" are different answers with the same effect
  on the surface: the value stands as written. They are kept apart anyway, because the first is
  about the kind and the second about the account.

---

## Pros and cons of the options

### A `holds=` parameter on `/candidates`

- **Good** — one round trip where a surface wants both, and no new route.
- **Bad** — one response shape carrying two answers, and one adapter function doing two jobs. A
  browse may be truncated and a lookup may not; a browse is slow and a lookup is cheap; a browse
  is allowed to be incomplete and a lookup either finds it or does not.
- **Bad** — every caller that wants only a name pays for a page it throws away. The template list
  and the routing record want exactly that.

### Store the label beside the value

- **Good** — no port change, and no request at all when drawing.
- **Bad** — core would carry presentation it never interprets.
- **Bad** — it rots. A retitled channel draws its old name for as long as nobody re-opens the form,
  which is the failure `durable` was introduced to prevent, reintroduced one layer up.

### Leave it, and say so on the surface

- **Good** — cheapest, and honest as far as it goes.
- **Bad** — it says "nothing here answers for this" identically for a channel typed by hand and one
  the page merely did not reach, which are different facts a person would act on differently.

---

## More information

Raised reviewing [reading a lasting name back](../reviews/lasting-name-read-back-2026-09-09.md),
as finding 1. The one page are.na answers is `packages/adapters/destination-arena/src/candidates.ts`;
the guidance it defers to is are.na's own.

Revisit if a third kind wants naming for something that is not a rename-proof handle — the shape
assumes one value maps to at most one entry, which a tag or a label set would break.
