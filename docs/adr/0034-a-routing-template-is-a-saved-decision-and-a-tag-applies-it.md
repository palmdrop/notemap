# 34. A routing template is a saved decision, and a tag applies it

**Date**: 2026-09-05
**Status**: Accepted — amends [ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md)'s
neighbourhood in `core.md` and closes half of the routing-rule open question held since 2026-08-02.
**Extended 2026-09-07** with what a tag does when its template cannot route (below)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

The same routing decision is made over and over. Gathering links for a research project means
opening the composer, taking the same destination, typing the same folder and deriving the same
kind of filename, once per capture, for weeks. Every part of that decision was already made the
first time; what the composer asks for the second time is a repetition, not a choice.

`core.md` has carried the shape of an answer since 2026-08-02 and never built it: *"Rules may
propose a destination from an item's tags, but a rule never delivers on its own."* The open
question beside it asks how rules are expressed, how fan-out is presented, and **whether a rule may
ever be trusted to fire unattended**.

So: what is a saved routing decision, where does it live, and what is allowed to apply one?

---

## Decision drivers

- **The decision is already made.** A person who set up *research links go to the vault under
  `research/`, named by their capture date* decided that once. Asking again per capture is asking
  them to re-decide something settled.
- **Delivery is always a decision** — the clause the spec has defended since the beginning, because
  material leaving the pool for somebody's vault is not something software should start on its own
  initiative.
- **It names a destination.** A destination is a row in the pool ([ADR 20](0020-destinations-are-pool-state.md)),
  so anything holding a `DestinationId` is holding pool state and inherits its problems: it must
  reach every device, and it must survive a rebuild from the mirror.
- **Configuration in two places is already the complaint.** `todo.md` records that destinations
  being configurable in both `config.toml` and the UI is too clunky to repeat.
- **A tag is the gesture that is already there.** The queue row has a tag chooser, the capture
  screen has one, and a source can supply tags with a capture. Nothing else in the shell is that
  reachable from that many places.
- **Classification is currently free of consequence.** Tagging changes nothing about where an item
  is or where it goes. Giving a tag an effect is a change to what tagging *means*, not just a new
  feature beside it.

---

## Considered options

1. **A rule table.** Conditions over an item — tags, source, payload type, age — matched by core,
   each naming a destination. The thing `core.md` has deferred since 2026-08-02.
2. **A template the person applies, and nothing else does.** A saved decision, offered in the
   composer's `where` list beside the destinations, taken in one gesture but still committed.
3. **A template a trigger tag applies.** The same saved decision, with a reserved tag that fires it
   when it lands on an item.
4. **A client-side preset.** The shell remembers what you last routed and offers it back. No pool
   state, no spec change, no reach across devices.

---

## Decision outcome

Chosen: **option 3**, which contains option 2 — a template is applied from the composer *and* by a
trigger tag, and both are the same act.

A **routing template** is pool state: a name, a destination, a capability, the arguments as
patterns ([ADR 35](0035-a-templates-arguments-are-patterns-expanded-when-the-decision-is-made.md)),
a folder mode ([ADR 36](0036-a-folder-is-created-required-or-established-once.md)), and an optional
**trigger tag**. It is mirrored, making it the mirror's third non-item unit after the destination.

**Applying a template is the decision, and the rewritten clause says so.** `core.md`'s
*"a rule never delivers on its own"* becomes *nothing delivers that a person did not ask for; a
template delivers because somebody applied it*. What that sentence was defending is intact: no
condition is evaluated, nothing is matched, and no software chose a destination. A person who tags
an item `route/research` has named a destination, a capability and a place in one gesture, and the
gesture is not a smaller decision than pressing `route` — it is the same decision, spelled shorter.
What option 1 would have added, and what is still refused, is a rule that fires on something the
person did not do: an age, a source, a payload type, a tag that means something else.

**A trigger tag is reserved and declared.** It lives under `route/`, so a tag with an effect is
recognisable as one without consulting anything, and the template **declares** its tag rather than
deriving it from its own name. Deriving would mean a rename silently disarms every `route/old` tag
already written, and would force a template's display name to be tag-shaped when it wants to be
prose. Two templates may not claim one trigger tag. A `route/` tag naming no template is an
ordinary tag that fires nothing and is refused by nothing — a tag is free text, and the template
it names may be made tomorrow.

**A template fires on the tagging, never on the tag being present.** The distinction matters
because tags carry over to a revision without going through `tag` at all: firing on presence would
re-route every revision of every research note forever. Tagging is idempotent, so re-applying a tag
an item already carries fires nothing, which is the same rule already written for attribution.
Untagging does not unroute — the record exists, and it is cancelled where cancelling lives.

**A source-supplied tag fires too.** Attribution would let core tell a person's tag from a
provider's, and this deliberately does not use it: a capture arriving from Memos already tagged
`route/research` filing itself is the point of the whole thing, not an accident of it. What that
buys is that an inbox can decide where its captures go; what it costs is that a system outside
notemap can cause a delivery. If that ever bites, the change is a per-template restriction, not a
different design.

**The routing record names the template it came from.** Three things need it: `establish` has to
know whether it has ever landed, the log wants to say *routed by research* rather than naming a
folder, and the settings view wants to say when a template last fired.

**A template may name a destination that is gone.** Deleting a destination a template names is
**allowed, with a warning** naming the templates it will strand. The invariant that a template
always resolves was rejected as too expensive for what it buys: a destination is undeletable once a
*record* names it, because a record is a fact about the past that would otherwise name nothing, and
a template is current configuration rather than history. A stranded template is drawn as such, and
is deleted or **repointed at another destination**, which is an ordinary edit of its destination
field — the report then says whether the capability and the arguments still fit where it now
points. Routing from a stranded template refuses with `unknown-destination`, which already exists.

**A template names a destination, and never `manual` or `discard`.** Both are entries the shell
invents rather than rows the pool holds, so allowing them would make a template a union carried
through the type, the wire, the settings form and the report. What that would buy is thin where a
person is present — the composer already reaches `discard` in one gesture, since it acts when
taken. What would reopen it is the case where nobody is present: a capture arriving from a source
tagged `route/noise` and archiving itself has no composer in the room. That is the argument to make
when it is wanted, and it is recorded here so it is not re-proposed blind.

**An item leaves the queue on its own, so something has to say so.** A fired template puts the
corner notice up under the rule `discard` already follows — it **stands** rather than lingering,
there is **one at a time**, and it carries the way to cancel while the delivery is pending. Without
that, auto-routing is the existing complaint about items vanishing from the queue, made worse and
made silent.

**Why not option 1.** A rule table makes delivery conditional on *matching* rather than on
deciding, which is the exact thing the deferred question was worried about, and it arrives with
fan-out, precedence and conflict — three problems that only exist once conditions do. Nothing here
forecloses it; a template is what a rule would have had for a right-hand side anyway.

**Why not option 2 alone.** It is two gestures where the point was one, and the second gesture is
the whole composer opening to confirm something already settled.

**Why not option 4.** It does not reach a second device, does not survive a rebuild, and cannot be
inspected — and the thing being saved names a `DestinationId`, which is pool state, so the client
would be holding a private reference to a public row.

### Consequences

- **Good** — the daily gesture is one tag, from the queue, the capture screen, or the source that
  made the capture.
- **Good** — a template is inspectable, editable and shared across devices, which a remembered
  last-route never was.
- **Good** — the routing record naming its template makes the log legible: an item went to
  `research` rather than to `vault`, under `create-or-append-file`, into a path a person has to
  read to recognise.
- **Bad** — tagging is no longer free of consequence. Typing `route/research` in the tag chooser
  sends the item. The mitigation is that the namespace is reserved and the shell marks a trigger
  tag as one, not that the effect is hidden.
- **Bad** — a system outside notemap can now cause a delivery, through a source-supplied tag. Taken
  deliberately; see above.
- **Bad** — the mirror gains a third unit, and rebuild gains a third thing to restore.
- **Bad** — a template can be stranded, so everything that reads one tolerates a destination that
  is not there: the composer draws it with its reason, the report says so, and the route refuses.
  Bought in exchange for a destination that stays deletable.
- **Neutral** — a template may be applied to an item that is already processed. Tagging a processed
  item is allowed, and an item may go to several destinations; nothing here is a new case.
- **Neutral** — the trigger tag stays on the item after firing. It reads as a record of why the
  item went where it went, and it is what a later filter is written against.

---

## Amendment, 2026-09-07 — a tag whose template cannot route is refused

Built, and one case this record did not name turned out to need answering: what happens when the tag
lands and the template cannot route. The `routing-templates` plan had written *the tag lands, the
failure reaches the log, and the item stays in the queue*, on the argument that a tag chooser must
not refuse input for reasons about a vault. That is now reversed, and the argument survives intact
because the reversal is narrower than the line it replaces.

**The distinction is between a template that is stale and a destination that is asleep.** A route
refused for `unreachable` says nothing about the template — the vault is unmounted, the server is
restarting — and that case does not refuse: the reservation is made and the delivery waits it out,
which is what [ADR 17](0017-delivery-is-asynchronous-and-retried-on-evidence.md) built. Every other
refusal is about the *template*: its destination was deleted or retired, its capability is no longer
declared, its expanded arguments no longer satisfy the schema. So the reasons a tag can now be
refused for are never reasons about a vault, which is what the original line was protecting.

**And landing the tag would be worse than refusing it.** Tagging is idempotent, so a tag that filed
nothing is **spent** the moment it lands: the person goes to settings, repoints the template, comes
back, applies the tag again — and it is absorbed. The item can never be filed by that tag. Leaving
it there also fills the queue with items wearing a tag that does nothing, which is the failure
[ADR 37](0037-a-fired-template-waits-and-a-route-that-never-landed-gives-the-tag-back.md) removes
for the cancelled and abandoned cases and would be reintroducing here.

**A capture is the exception, and drops the tag rather than refusing.** A source-supplied trigger
tag has nobody in the room to be told, and refusing would lose a whole capture over a tag —
`core.md` already drops a tag that trims to nothing on exactly that reasoning. Dropping is the same
call as refusing, made where a refusal has no reader: in both cases the tag does not land, because a
tag that filed nothing is spent either way.

**Cost, taken knowingly**: the tag chooser now has an input that can be refused, which no other tag
is. The mitigation is the one this record already chose for the same problem — the namespace is
reserved and the shell marks a trigger tag as one — so the tag that can be refused is exactly the
tag drawn as having an effect.

---

## Prior decisions this rests on

- [ADR 20](0020-destinations-are-pool-state.md) — a destination is a row rather than configuration,
  which is why anything naming one is a row too.
- [ADR 12](0012-core-keeps-an-append-only-action-log.md) and
  [ADR 32](0032-a-shell-learns-what-happened-by-reading-the-log.md) — a fired template is
  something that happened while nobody was asking, and the log is how a shell finds out.
- [ADR 21](0021-an-item-is-editable-until-it-is-processed.md) — routing processes an item, so a
  fired template seals a capture. This is why the corner notice carries a cancel.

## More information

Revisit if fan-out is wanted — one tag reaching two destinations — which is where the rule table's
questions come back, or if a source-supplied tag causing a delivery turns out to be alarming in
practice rather than in theory.
