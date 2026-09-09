# Review: A lasting name read back as the name it stands for

**Date**: 2026-09-09
**Status**: Open
**Scope**: `apps/ui/src/lib/candidate-list.ts`, `apps/ui/src/components/routing/CandidateBrowser.svelte`, `apps/ui/src/components/settings/TemplateForm.svelte`
**Spec**: `docs/specs/shell.md`, `docs/adr/0042-a-candidate-carries-both-its-readable-name-and-its-lasting-one.md`

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

### 2. `offered-only` is now doing two jobs

`apps/ui/src/components/settings/TemplateForm.svelte:259` — `naming={field.offeredOnly}` reuses a
flag that says *what a field may hold* to decide *how a field is drawn*. The spec now states the
coupling, so it is a decision rather than an accident, but the two are not the same question: a
field can be offered-only and still hold something a person can read, and it now gets a line
showing a label over a value for no gain.

The sharper half is that `settle` in naming mode keeps whatever was typed
(`CandidateBrowser.svelte:357` — `took(resolved(...) ?? written)`), so an offered-only field
accepts a value the destination never offered. That is right, and the spec argues for it, but it
means `x-notemap-offered-only` is advice on every path the shell takes and a constraint on none.
ADR 42 already flags "a second kind wants `offered-only` for refusal rather than for advice" as the
thing to revisit; this widens the gap rather than narrowing it, which is worth saying out loud
before a third caller reads the flag as a promise.

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

<!-- Add once findings are addressed, and flip **Status** above. -->
