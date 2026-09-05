# One tag files it where it goes

**Date**: 2026-09-05
**Status**: In progress <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/mirror.md`, `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> Gathering links for a research project is one gesture per capture. A **routing template** holds
> the decision — this destination, this capability, this folder, a filename derived from the
> capture date — and a **trigger tag** applies it. `route/research` on an item files it and the
> item leaves the queue, with the corner saying so and offering the way back.

Four ADRs settle the shape:
[34](../adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md) — a template is
pool state and applying one is the decision, which rewrites `core.md`'s *"a rule never delivers on
its own"* rather than working around it;
[35](../adr/0035-a-templates-arguments-are-patterns-expanded-when-the-decision-is-made.md) — the
arguments are patterns, core expands them when the decision is made, and a capture records the UTC
offset it was made at so `{{captured_at}}` means the right day;
[36](../adr/0036-a-folder-is-created-required-or-established-once.md) — a folder is `create`,
`require` or `establish`, the check is the adapter's at delivery, and a moved folder is `rejected`
so the item comes back to the queue;
[37](../adr/0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md) — a
fired template never attempts inline, so the corner's cancel is real; the tag and the reservation
commit together; and a reservation removed without delivering takes its trigger tag with it.

**Out of this slice, deliberately**: conversion. A template says *where*, never *in what shape* —
`todo.md`'s other "routing templates" line, the one about a local model rewriting a loose capture
into a list entry, is ADR 19's territory and is renamed to **conversion** in phase 1 so the two
stop sharing a word. Also out: a rule table with conditions, fan-out to several destinations from
one gesture, and capture templates that auto-tag at capture time — the last of which composes with
this for free once it exists, and is a better feature for having waited.

**The order is deliberate.** Firing is last. Everything before it is a template you apply by hand
from the composer, which is already most of the win, and the guard that tells you the research
folder moved lands before the thing that would otherwise file into a folder nobody meant.

---

## Tasks

### Phase 1 — The decisions

Depends on nothing.

- [x] Create branch `agent/routing-templates`
- [x] [ADR 34](../adr/0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md) — a
      template is pool state, the record names it, a trigger tag is declared under a reserved
      `route/` namespace, firing is on the tagging and not on the tag being present, and a
      source-supplied tag fires too
- [x] [ADR 35](../adr/0035-a-templates-arguments-are-patterns-expanded-when-the-decision-is-made.md)
      — core expands, at decision time, from a closed vocabulary with named formats; the line
      against ADR 31 is that the adapter resolves what only it can know and core resolves what only
      the item knows; the capture carries its offset and the host names the fallback zone
- [x] [ADR 36](../adr/0036-a-folder-is-created-required-or-established-once.md) — three modes, two
      values reaching the adapter, and why this is an argument rather than the fourth capability
      name ADR 31 asked for
- [x] [ADR 37](../adr/0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md)
      — a fired template enqueues its first attempt due a configured window later rather than
      attempting inline, which is what makes the corner's cancel real against a mounted vault; the
      tag and the reservation are one transaction, so *tagged but not reserved* cannot exist; and a
      cancelled or abandoned reservation removes the trigger tag, since tagging is idempotent and an
      item that keeps it can never be filed by it again
- [x] `CONTEXT.md` gains **Routing template** — a saved routing decision, with its Avoid line
      naming *rule*, *preset* and *macro*: rule is the conditional thing this is not, and the other
      two say nothing about routing
- [x] `CONTEXT.md` gains **Trigger tag** — a tag under `route/` that a template declares, and whose
      arrival applies it
- [x] `CONTEXT.md` gains **Conversion** — a destination reshaping a copy on its way out, ADR 19's
      thing, with an Avoid line naming *template* now that the word means something else
- [x] `todo.md`: the two "routing templates" lines are retitled to conversion, and the entry that
      wanted this feature points at this plan
- [x] Verify: the ADRs are confirmed with the developer; `pnpm lint`
- [ ] `git commit`

### Phase 2 — A template is pool state

Depends on phase 1.

- [x] `RoutingTemplate` in `#types/domain`: an id, a name, the destination, the capability, the
      arguments as patterns, the folder mode, an optional trigger tag, `establishedAt`, and the
      timestamps a destination row already carries
- [x] Core's read and write halves beside `pool/destinations/`, in `pool/templates/`: list, create,
      edit, delete. Not retire — a destination is retired because records name it forever, and a
      template names nothing that outlives it
- [x] A trigger tag is **unique across templates** and must sit under `route/`. Refuse both, with
      their own refusal kinds
- [x] **Deleting a destination a template names is allowed, and warns**, naming the templates it
      will strand. A record naming a destination still refuses the delete: a record is history that
      would otherwise name nothing, and a template is configuration. Everything reading a template
      tolerates a destination that is gone, and routing from one refuses with the
      `unknown-destination` that already exists
- [x] The **routing record names its template**, optionally: a hand-made decision names none. It
      also says whether **the tagging made it**, which is what phase 9's untag rule reads and what
      lets the log say a template fired rather than that somebody took one. A migration for the
      columns, appended rather than edited
- [x] The mirror carries templates as its **third non-item unit**, one `.json` per template under
      `pool-mirror/templates/`, beside the destinations directory and on the same reasoning: a
      template is something a person set up and would otherwise recreate by hand. A write is owed
      when one changes
- [ ] Rebuild restores templates before items, since a record names one — **nothing to build
      here**: rebuild does not exist (`mirror.md`), so this is a line phase 10 writes into the spec
      beside the destination's, and the code owes it nothing today
- [x] Tests: the trigger tag rules refuse what they should, in core and again as the store's own
      unique index; a template round-trips through the mirror, as a property beside the
      destination's; deleting a destination a *record* names is still refused, and deleting one a
      *template* names goes through and names what it stranded. Not *a rebuilt pool holds its
      templates*: there is no rebuild to run one through
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`
- [x] `git commit`

### Phase 3 — A capture knows what time it was

Depends on nothing in this plan; do it before phase 4.

- [ ] A capture carries an optional **UTC offset in minutes**, through the domain type, the store,
      the mirror record and its parse, and `POST /v1/captures`
- [ ] The web shell sends it, from the browser, at the moment of capture. The client's outbox
      carries it, so a capture made offline and drained tomorrow still says which day it was
- [ ] The host names the **fallback zone**, an IANA name in `config.toml`, supplied to core beside
      the clock on the terms `core.md` already sets for operational knobs
- [ ] Tests: the mirror round-trips an offset and its absence; a capture with no offset falls back
      to the host's zone rather than to UTC
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`
- [ ] `git commit`

### Phase 4 — Patterns expand

Depends on phases 2 and 3.

- [ ] The expander in core, over the closed vocabulary in ADR 35's table. Applied to **string
      values only**, at every depth of the argument object, with the result validated against the
      capability's `argumentsSchema` exactly as a hand-made argument set is
- [ ] **Expansion is statically total**: an unknown field or an unknown format refuses the write
      when the template is saved, and every field in the table is present on every item, so there
      is no second refusal at route time
- [ ] Routing from a template: one core method taking an item and a template, expanding, and
      landing in the same `route` path a hand-made decision takes. The record stores the expanded
      arguments and the template's id
- [ ] Tests: each pattern in the table, including the date being read in the capture's own offset;
      the static refusals; the expanded arguments reaching the record
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`
- [ ] `git commit`

### Phase 5 — Folder modes

Depends on phase 4.

- [ ] `folder: "create" | "require"` on the argument schemas of `create-file`, `append-to-file` and
      `create-or-append-file`, in both kinds, defaulting to `create` so every existing decision is
      unchanged
- [ ] The filesystem kinds look for the folder before writing under `require`, and refuse with
      `rejected` and a detail naming the folder. Shared in `@notemap/output-markdown` where the
      three capabilities already share their work
- [ ] The template's `establish` resolves at decision time: unestablished to `create`, established
      to `require`. The word never reaches an adapter
- [ ] `establishedAt` is written in the transaction that stores the **first delivered** record
      naming the template, and **cleared when the template's arguments are edited**
- [ ] Tests: `require` against a missing folder is `rejected` and the abandon path returns the item
      to the queue; `establish` creates once then requires; editing the arguments clears the
      establishment; an abandoned first delivery leaves it unestablished

The abandon path is also where a fired template's tag comes off, which is phase 9's rule and is
tested there — nothing fires yet at the end of this phase.
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`
- [ ] `git commit`

### Phase 6 — On the wire

Depends on phase 5.

- [ ] `GET /v1/templates`, `POST /v1/templates`, and edit and delete beside them, shaped on
      `/v1/destinations`, which is the surface a settings page already knows how to read
- [ ] `POST /v1/items/{id}/route` accepts a **template** in place of a destination, a capability and
      arguments. One route, two bodies, because it is one decision either way
- [ ] `POST /v1/items/{id}/route/preview` takes the same body, so previewing a template costs
      nothing extra
- [ ] `POST /v1/items/{id}/route/resolve` answers what a template would route as — the destination,
      the capability and the expanded arguments — without reserving anything. This is what lets the
      composer draw the filename before the commit, and it is a different question from preview,
      which answers bytes
- [ ] `GET /v1/templates/{id}/report`, the live read, on `/v1/destinations/{id}/description`'s
      terms: never folded into the list, so the settings page draws from pool state instantly and
      each row goes and looks on its own
- [ ] The client holds templates in its cache and offers them offline, on what it already does for
      destinations
- [ ] Tests: the routes beside themselves; the client's cache; the OpenAPI document builds
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`
- [ ] `git commit`

### Phase 7 — The composer takes a template

Depends on phase 6. **The feature is usable at the end of this phase**, minus the firing.

- [ ] Templates are a **band in the `where` list**, above the destinations, reached by the same
      typed prefix match and the same `⏎` on an only match — a third band under the rule idiom the
      list already uses for `manual` and `discard`
- [ ] Taking one draws what it resolved to — the destination in the chrome, the expanded place on
      the line — and **leaves it editable**. A template is where the decision starts, not a form
      that refuses to be corrected
- [ ] A template that cannot apply is **drawn with its reason and not removed**, which is the
      list's existing idiom: a stranded template, an unusable destination, a capability no longer
      declared. Never a pattern — expansion is statically total, so there is no such reason
- [ ] The chrome reads `process · research`, and the commit reads `route`
- [ ] Tests: taking a template fills the line; the resolved place is editable; an inapplicable
      template draws its reason
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`
- [ ] `git commit`

### Phase 8 — Templates in settings, and what cannot support them

Depends on phase 7.

- [ ] A **Templates** section on the settings page, under the same three levels of hierarchy the
      page already has: a line per template with its name, its destination and what it last
      answered; opening one adds the arguments, the folder mode, the trigger tag, when it last
      fired, and the ways to edit and delete it
- [ ] A form for the arguments built from the same `argumentsSchema` the composer builds from, with
      the patterns typed as text and the static refusal drawn where it belongs
- [ ] Each row **asks its own report as the page draws**, per row, so the first template whose
      destination has to go and look does not hold up a list already drawn from pool state. A
      settled answer is not asked again; one that could not be reached is asked when the pool comes
      back
- [ ] A **stranded** template — one whose destination was deleted — leads with that, and is deleted
      or **repointed**, which is an ordinary edit of its destination field followed by the report
      saying whether the capability and the arguments still fit where it now points
- [ ] The folder check reads the **literal prefix** of the path — the part with no pattern in it,
      which is exactly the part that moves — through `candidates`
- [ ] **Unreachable is not an alarm.** A destination that cannot be asked says so quietly and draws
      no accent. The `gone` mark removed from the composer on 2026-09-04 is the mistake being
      avoided
- [ ] Tests: the report's four cases; an unreachable destination draws no alarm; the prefix check
      asks the right scope
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`
- [ ] `git commit`

### Phase 9 — A tag applies it

Depends on phase 8.

- [ ] `tag` resolves a trigger tag to its template and reserves, **tagging and reserving in one
      transaction** ([ADR 37](../adr/0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md)),
      so a daemon that dies mid-act leaves either both or neither and nothing has to sweep for the
      state in between. There is no I/O to keep out of it, because the attempt is a job
- [ ] **No inline attempt on this path.** The delivery is enqueued with `nextAttemptAt` a configured
      window from now — an ordinary job at `attempt` zero, which is what a backed-off retry already
      is — so the window survives a crash and the corner's cancel is real against a mounted vault.
      A route made by hand in the composer keeps ADR 17's inline attempt, unchanged
- [ ] The host names the **window**, beside the fallback zone in `config.toml`, on the terms
      `core.md` sets for operational knobs
- [ ] Firing is on the **tagging**, so a revision copying a trigger tag fires nothing and an
      absorbed re-tag fires nothing. An offline tag fires when the outbox drains it, in the daemon,
      by this same path — the client's `tag` operation is what arrives, so nothing sweeps for
      tags that ought to have routed
- [ ] A refused route does not refuse the tag. The tag lands, the failure reaches the log, and the
      item stays in the queue — the alternative is a tag chooser that refuses input for reasons
      about a vault
- [ ] **Cancelling or abandoning a tag-fired reservation removes the trigger tag**, since tagging is
      idempotent and an item that keeps it can never be filed by it again. Only a tag-fired one: a
      template taken in the composer leaves the person's own tags alone. The log says the tag came
      off with the cancellation, so it does not read as having removed itself
- [ ] The action log says a template fired, and which one
- [ ] The corner reads `routing · research` while the window is open and carries `cancel`; it reads
      `routed · research` once the record resolves and carries only the way to dismiss it. Under the
      rule `discard` already follows: it **stands** rather than lingering, and there is **one at a
      time**
- [ ] The tag chooser **marks a trigger tag as one**, in every place it is offered, so nobody types
      one by accident
- [ ] Tests: tagging fires and reserves in one transaction, and nothing is attempted inline; the job
      is claimable only once the window has passed; cancelling inside it removes the reservation,
      the tag, and returns the item to the queue; an abandoned first attempt does the same; a
      composer-made route from the same template leaves the tag; re-tagging does not fire; a
      revision carrying the tag does not; a source-supplied tag does; a tag drained from the outbox
      does; a refused route leaves the tag and the item; the log says which template
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`
- [ ] `git commit`

### Phase 10 — The specs say so

Depends on phase 9.

- [ ] `core.md`: a **Routing templates** section; Classification gains what a trigger tag is, what
      firing on the tagging means, and that a cancelled or abandoned tag-fired reservation takes the
      tag back; Routing gains the window a fired template waits out, the transaction the tag and the
      reservation share, and the amendment to *"the inline attempt is the first attempt"* that holds
      for that path alone; Routing's *"a rule never delivers on its own"* is rewritten
      to *nothing delivers that a person did not ask for*; the 2026-08-02 routing-rule open question
      is marked half closed, with conditions, fan-out and precedence named as what is still open;
      the 2026-08-13 filename question notes that a template answers it for the person who
      configured one and that the general answer is still a title nobody has
- [ ] `mirror.md`: the third non-item unit, its directory, and what a rebuild restores in what order
- [ ] `http-v1.md`: the routes, and the `route` body's two shapes
- [ ] `client.md`: what the cache holds and what it answers offline
- [ ] `shell.md`: the `where` list's third band, the Templates settings section, the corner notice
      for a fired template — `routing` with a cancel while the window is open, `routed` after — and
      trigger tags being marked in the chooser
- [ ] `CONTEXT.md`: **Routing record** gains the template it came from
- [ ] `todo.md`: close what this plan closed, and leave what it did not — the rule table, fan-out,
      capture templates, conversion
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, and **`pnpm test:stack`**,
      which this earns several times over
- [ ] `git commit`

---

## Unknowns

None left. All four were cleared on 2026-09-05 and are recorded where they belong rather than here:

- A destination a template names **stays deletable and warns**; a stranded template is deleted or
  repointed, and routing from one refuses with the `unknown-destination` that already exists
  (ADR 34, phases 2 and 8).
- A template **names a destination**, never `manual` or `discard`, with the case that would reopen
  it — a source-supplied tag archiving a capture with no shell in the room — recorded in ADR 34.
- **`{{tag:<prefix>}}` is dropped**, which is what makes expansion statically total. It was the one
  pattern expanding to a value core did not shape, and a tag holding a slash or a colon would have
  put unsanitised text into a filesystem path (ADR 35).
- What a template does to the shape of the queue is not a decision. It is in Notes.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The template, the expander and the establishment are core's and are tested there, with the
expander's table tested pattern by pattern including the offset. The folder check is tested in the
adapter over a temporary tree, and the test that matters is that the item comes back to the queue —
`rejected`, abandoned, reservation removed — rather than that the write did not happen. The routes
are tested beside themselves; the composer band, the settings section and the corner notice in the
shell's suite. Phase 10 runs `pnpm test:stack`: this crosses the config file, the HTTP surface, the
host's wiring, the client's transport and the mirror, which is all of them.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

**Worth looking at once this has been lived with**: what a template does to the shape of the queue.
If a good share of it files itself on arrival, the queue becomes the things that actually need a
decision, which is what it was for. That is a guess, and the only way to find out is to use it.
