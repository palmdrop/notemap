# Review: A lasting name read back as the name it stands for

**Date**: 2026-09-09
**Status**: Resolved
**Scope**: `apps/ui/src/lib/candidate-list.ts`, `apps/ui/src/components/routing/CandidateBrowser.svelte`, `apps/ui/src/components/settings/TemplateForm.svelte`
**Spec**: `docs/specs/shell.md`, `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/adr/0042-a-candidate-carries-both-its-readable-name-and-its-lasting-one.md`, `docs/adr/0044-naming-a-value-is-a-second-question-a-destination-answers.md`

---

## Overall

The branch does what ADR 42 left open: a template's `channel` field keeps `12345` and the line
above it reads `Reading`. The shape is right — `takenAs`/`readAs` over a three-valued `Form`
replaces a boolean that could only ever say two things, and `draft` keeps the line's text apart
from the field's value only for as long as somebody is typing. Tests cover both directions and the
value the browse never mentioned.

The branch as reviewed is **not** what was committed. It also carried a second feature — filling in
a schema's declared `default` — which `main` landed in parallel as `preset`/`presetsFrom`, wired
into the composer, spec'd, and ticked off in `todo.md` on the same date. That half was dropped in
the rebase, on the reasoning below; what is left is one feature. The one finding worth acting on is
**#1**: the label lookup only sees the page of the answer that arrived, so on an account with more
channels than the destination returns, the field goes back to reading `12345` with nothing to say
it is the unfixed case rather than the fixed one.

---

## Bugs

### 1. A truncated answer reads back as the id it was meant to replace

`apps/ui/src/lib/candidate-list.ts:37` — `readAs` searches `entries`, which is the answer the
destination gave for this field and scope, and `truncated` is a state the browser already tracks
and draws. Where the held channel is past the end of that answer, `readAs` falls through to
`named?.label ?? held` and the line reads `12345`.

```
account with 200 channels → answer truncated at N → held id not among entries → line reads the id
```

That is the same rendering the branch exists to remove, on exactly the accounts big enough for
somebody to have wanted it. It is also indistinguishable from the case the last test pins
(`keeps a channel the browse never mentioned exactly as it was typed`), which is deliberate
behaviour for a value nothing offered — so the surface cannot tell "no such entry" from
"not on this page" and says nothing either way.

Fix: the label has to come from somewhere that does not depend on the page. Either ask the
destination for the one entry the field holds when it is not in the answer, or store the label
beside the value at the moment it is taken — the second is the shape `todo.md` already names for
the template list and the routing record, and this is the third caller for it.

---

## Design

### 2. Withdrawn — see Non-issues

This was filed as "`offered-only` is now doing two jobs". It was wrong, and the reason is one file
away: `packages/core/src/pool/destinations/vocabulary.ts:34` says the annotation is *"said for the
surfaces"* and that core never reads it. Deciding how a field is drawn is the flag working as
declared, not a second job. Kept numbered so the findings below stay referenceable.

### 3. `stem` and `draft` are two answers to nearly one question

`apps/ui/src/components/routing/CandidateBrowser.svelte:86` and `:102` — both hold "what was typed,
as distinct from what the field holds". `stem` came from `main` for the `⇥` walk and survives a
take; `draft` came from this branch for the naming line and is cleared by one. They were merged
rather than unified, and the merge works, but a reader now has to hold two lifetimes in their head
to answer what the line is showing.

They are not the same thing — `stem` is a filter and `draft` is text — but a component with two
overlapping shadow-states for one input is where the next keyboard bug will come from.

---

## Minor

### 4. A blur with nothing typed writes the value back

`apps/ui/src/components/routing/CandidateBrowser.svelte:346` — in naming mode with `draft`
undefined, `settle` calls `resolved(entries, text, keeps)` where `text` is the label. `resolved`'s
"already the form this surface wants" guard compares against `takenAs(entry, "durable")`, which is
never the label, so the guard never fires and every blur resolves the label afresh and calls
`onchange` with the value already held. Harmless today. It stops being harmless if the answer ever
changes under a form left open — a retitle making two labels share a prefix could re-point the
field on a blur nobody typed into.

### 5. The merged `⇥` path in naming mode is untested

`apps/ui/src/components/routing/CandidateBrowser.svelte:261` — the interaction between `stem` and
`draft` is the subtlest thing in the file and no test drives it. `templates.test.ts` covers taking,
typing-then-blurring, reading back and the unknown value; nothing presses `⇥` twice on a naming
line. The merge was made during this rebase, so the gap is this branch's to close.

---

## Non-issues

- **`held` compares against `value`, not `text`** (`CandidateBrowser.svelte:438`) — correct: the
  row marked as taken is the one the *field* holds, and in naming mode the line deliberately reads
  something else.
- **The list collapses to one row after a take** — `matching` narrows on `text`, which after a take
  is the entry's own label. Same behaviour the non-naming line has always had with the value.
- **`naming` is not wired into `ProcessingComposer`** — by ADR 42 the composer takes the readable
  form, so its value is already a name and there is nothing to read back.
- **`takenAs(entry, "label")` inside `readAs` would be an identity** — `readAs` is only ever called
  with `keeps`, which is never `"label"`. Dead but cheap, and the alternative is a narrower type
  for one caller.
- **`naming={field.offeredOnly}` decides how a field is drawn from a flag about what it may hold**
  — intended, and the annotation says so: `x-notemap-offered-only` exists *for the surfaces* and
  core never reads it (`packages/core/src/pool/destinations/vocabulary.ts:34`). It is also the
  right signal, being precisely "this value names something already there", which is what makes it
  a handle rather than a name. Filed as finding 2 and withdrawn.
- **An offered-only field still accepts a value the destination never offered** — deliberate, on
  ADR 42's own terms: the browse answers one page, so a value outside it is not evidence of
  anything. `offered-only` withholds advice; it does not refuse input.

---

## Rebase note

`main`'s #53 (`73b46ad`) landed a schema-`default` feature under the name `preset`/`presetsFrom`
while this branch implemented the same thing as `default`/`defaultsOf`. On rebase the branch's
version was dropped in favour of `main`'s, which is spec'd in `shell.md` and closed in `todo.md`.

The branch also extended defaults into `TemplateForm`, which `main` explicitly rules out —
*"never written into a template's own arguments"*. That extension was dropped with the rest. It is
a real question, not a settled one: a person authoring a template is choosing what it holds, and a
default drawn there is arguably the same suggestion it is in the composer. Reopening it means
amending the paragraph `main` just landed, so it wants its own change and its own argument.

`CandidateBrowser`'s `⇥` handler was rewritten by both sides and was merged by hand: `main`'s
first-press-completes-then-walk, with `text`/`typing` in place of `value`/`durable` so it works in
either mode. See finding #5.

---

## Resolution

1. **Fixed**, and not in the shell — the shell could not fix it. `/candidates` answers a capped
   page and has no way to ask about one value, and the pool's other place-answering route carries
   no label and reads routing records, so a template saved and never fired has nothing in it.
   Added a second question to the destination port:
   `GET /v1/destinations/{id}/named?capability&field&value`, answering the one entry that value
   names on `/candidates`' own failure kinds and after its own two checks, through `naming` on the
   `Destinations` port and an optional `naming` on a kind adapter. The are.na adapter answers it
   from `GET /v3/channels/{handle}`, which takes an id or a slug; the filesystem and webdav kinds
   have none, and `not-offered` is the right answer for a kind whose places are their own names.
   The browser asks only where its own page had nothing to say, so a channel the browse already
   listed costs no request.
   ([ADR 44](../adr/0044-naming-a-value-is-a-second-question-a-destination-answers.md))

   **Extended after hand testing.** Fixing the form left every surface that *reads a decision back*
   still drawing the id — the settings template list, a routing record, a row's routing line — which
   is most of where a person meets one. Those three ask no destination anything, so what any surface
   learns about a value is now remembered in the browser and all of them read it, filled from one
   browse where a page carries it and an ask per value where it does not. Hand testing also found
   that only the **numeric id** resolved for a channel outside the answered page, which is the one
   name of the three nobody can get hold of; settling now asks, so a slug out of a channel's URL
   lands on the lasting form.
2. **Won't fix — the finding was wrong.** `offered-only` is declared as advice for surfaces and
   core never reads it, so using it to decide how a field is drawn is the annotation working as
   specified. Moved to Non-issues so it is not re-raised.
3. **Fixed.** `draft` and `stem` become `line` and `filter`, named for what each is — text the
   field does not hold yet, and what the list is narrowed by once the line stopped being it. The
   thing that made them two ideas rather than one was that the drawn list followed the line while
   `⇥` walked the typed stem; `filtering` now decides both, so the eye and the keyboard walk one
   list again — which is what the file already claimed and did not do. It also fixes a case nobody
   had filed: a naming line reading a name narrowed the list to the one entry it already held, and
   an off-page value narrowed it to nothing at all.
4. **Fixed.** `settle` returns early where the line is reading rather than writing, so a blur
   nobody typed into writes nothing.
5. **Fixed.** `walks the channels a typed name still matches, in names` drives `⇥` twice on a
   naming line and asserts the durable form that reached the wire, plus that both rows are still
   drawn. New tests also cover the off-page ask, the no-ask case, and a handle nothing answers for.
