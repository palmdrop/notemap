# A destination can be asked what it holds

**Date**: 2026-08-30
**Status**: In progress <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`, `docs/specs/security.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> Routing into a real vault becomes choosing rather than typing: a destination can be asked what
> one **argument** could hold — a folder, a note to append to, later a board column or the tags a
> vault already uses — and the routing composer draws that as something to walk. Typing a place
> that does not exist yet stays possible, because creating a note in a new folder is a legitimate
> thing to want.

Rewritten 2026-08-30 after a grilling session. The first version asked a destination to enumerate
what it held **at a path**, and returned entries that were collections or items. That is a tree
walk, and it re-commits the mistake core.md:611 records making once already: a fixed vocabulary
that turned out to be filesystem-shaped. [todo.md](../todo.md) line 2 is the counterexample and it
is the developer's own — *"Router should be able to advertise folders, **and keep track of custom
tags that exist** for auto-routing."* A vault's tags have no path and no hierarchy, and neither do
a board's columns. So the question a destination is asked is about **a field of a capability's
argument schema**, hierarchy is something an answer may offer rather than something the protocol
assumes, and the schema says only that a field can be asked about — not what sort of place it
names.

Two things ride along because this plan is already editing every argument schema and every
settings form. The code calls the object a delivery supplies a `target`, which is the word
CONTEXT.md:227 tells us to avoid and the word `RoutingTarget` uses for something else entirely, so
that a delivery's arguments are reached today as `record.target.target`. And a filesystem
destination's `root` is free text with nothing between a typo and the daemon's own state.

## Amended 2026-08-31 — three names settled

Phases 1 and 2 are merged. Three things the plan left to confirm were confirmed, and one of them
changes what phase 7 builds.

- **The method is `candidates`.** `enumerate` was the tree walk this rewrite stopped being, and
  `suggestion` is a word CONTEXT.md already spends on an enrichment's proposal.
- **The annotation is a vendor-prefixed keyword**, `x-notemap-candidates`, rather than a borrowed
  JSON Schema `format`. One bit has nothing to gain from overloading a standard keyword and a
  strict validator to lose.
- **The route is a `GET` with query parameters**, not the `POST` phase 7 proposed. `http-v1.md` has
  no stance on a read that posts, and nothing needed one: no enumerable field of either kind
  depends on another — `create-file` takes `directory` and `filename`, `append-to-file` takes
  `path` and `heading`. A read is a `GET`, with no exception to explain.

That last one reaches back into phase 3. A request carried the arguments filled in so far, so that
a later field could depend on an earlier one; a `GET` cannot carry them and nothing can supply
them, so the port stops taking them too. A port parameter no caller can fill is worse than one
added when a kind finally needs it.

---

**Out of this slice, deliberately**: preview, the output a delivery records, and the record view
that reads them — [delivery-output-and-preview](delivery-output-and-preview.md) and
[item-route-and-record-view](item-route-and-record-view.md). Templates and rules stay open.
A **per-kind component registry** in the shell is deliberately not built: phase 9 builds the seam
it would plug into and stops there, because the two kinds notemap has are being made to converge
on purpose ([destination-webdav](destination-webdav.md) gives the webdav kind the filesystem
kind's own capability names and argument shapes), and a custom UI per kind pays off only where
kinds diverge.

---

## Tasks

### Phase 1 — Arguments, not target

Depends on nothing. Nothing behaves differently when this phase lands.

- [x] Create branch `agent/destination-targets`
- [x] The glossary is already right and the code is not. `CONTEXT.md`'s **Capability** entry says a
      capability "carries a schema for the **arguments** a delivery must supply: where it goes, and
      anything else that shapes it, such as a template or a format", and **Destination** lists
      `target` among the words to avoid. Rename to match: `Capability.targetSchema` →
      `argumentsSchema`, `DeliveryRequest.target` → `arguments`, `Delivery.target` → `arguments`,
      and the `target` inside `RoutingTarget` → `arguments`
- [x] `RoutingTarget` itself keeps the word, and so does the `target_kind` column: destination-or-user
      is the sense the glossary permits. Only the object the capability was pointed at is renamed
- [x] A new migration renames the column and recreates the two triggers that guard it. Migrations
      are append-only and tracked by `PRAGMA user_version` — the file says so at the top — so an
      existing pool is carried across rather than broken
- [x] The mirror codec reads and writes `arguments`; the round-trip property test and the
      arbitraries follow it. A mirror written before this phase no longer parses, which costs
      nothing today because rebuild is unbuilt, and is worth saying out loud rather than discovering
- [x] The filesystem adapter's `CreateFileTarget`, `asCreateFileTarget` and their `append-to-file`
      counterparts; the `/v1` route bodies and the regenerated OpenAPI document; the client's types;
      the shell's `schema-form.ts` callers
- [x] `CONTEXT.md`: **Capability** and **Routing record** stop saying target where they mean
      arguments. **Destination**'s Avoid line keeps `target` and `sink`, and loses `output` —
      [delivery-output-and-preview](delivery-output-and-preview.md) gives that word a meaning of its
      own, and a glossary cannot both define a word and ban it
- [x] The evidence this phase offers is a green suite after a pure rename: no test rewritten except
      where one names the field
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, and `pnpm test:stack` —
      the wire shape changes, which is exactly what that suite is for
- [x] `git commit`

### Phase 2 — A root you did not mean

Depends on nothing; lands after phase 1 to keep the diffs legible.

- [x] **The boundary is the deployment, and that is a decision rather than an omission.** The
      compose files and the `Dockerfile` gain one directory under which vaults are mounted, and the
      container reaches nothing else because nothing else is mounted. A daemon run directly has the
      reach of the person running it, which is the reach they already had — confining it there would
      buy nothing and would make the first vault cost a config edit and a restart, which is what
      [ADR 20](../adr/0020-destinations-are-pool-state.md) removed
- [x] `docs/running.md` says to mount vaults under that directory, and why there is nothing else to
      configure
- [x] **A root overlapping the daemon's own state is refused**, whether it contains them or sits
      inside them: the pool, the mirror and the assets. Routing a note into the mirror is
      destructive and nobody ever means it. The host hands the adapter the paths it must refuse —
      which paths are the daemon's own is the host's knowledge, not core's and not the adapter's
- [x] The refusal surfaces as `unusable` from `describe()` with the reason, which is the treatment
      core.md:637 already gives a destination the running code cannot make sense of, and needs no
      new port method. It bites where it matters: such a destination is not routable and delivers
      nothing
- [x] **The settings form confirms a root the pool has not been pointed at before**, showing the
      resolved real path — the adapter already resolves symlinks to contain a delivery. Familiar
      means equal to, or under, the root of a destination that already exists; nothing new is
      remembered. **Deviation**: no route exposes the resolved real path (`describe()` stays
      filesystem-free and `deliver()`'s resolution is never returned), so the shell shows the typed
      path rather than the real one. Flagged rather than solved by inventing a route, per this
      task's own fallback
- [x] The confirmation says what it is: a check against a mistake. It authenticates nobody, because
      whoever can create a destination over `/v1` can also confirm one. Do not word it as a
      permission
- [x] `security.md` gains the posture, in its own words — this is the spec of what is undefended and
      this is a statement of exactly that kind. The bind-address section already had to be rewritten
      for the container; this sits beside it
- [x] Tests: the state-path refusal beside the adapter, the confirmation in the settings suite
- [x] Verify: `pnpm -r --silent test` — passes, along with `pnpm -r typecheck`, `pnpm lint` and
      `pnpm format:check`. **Not done**: by hand against a container — no Docker in this
      environment. The compose files and `Dockerfile` want a manual `docker compose up` check
      before release
- [x] `git commit`

### Phase 3 — The decision, and the port

Depends on phase 1, for the word.

- [x] An ADR: **a destination can be asked what an argument could hold.** The reasoning worth
      keeping: `describe()` deliberately touches neither disk nor network, because an unmounted
      drive and an unreachable Nextcloud must still be *routable* with the delivery deferred, and
      folding this into it would make every settings screen stall on a destination that is merely
      asleep. It is asked about **a field** rather than a path, because folders, notes, board
      columns and a vault's tags are all answers and only two of them are hierarchical. It is asked
      one scope at a time, because a vault holds thousands of notes and an adapter that answers
      "everything" is one nobody can use twice
- [x] The method joins `DestinationKindAdapter` and the `Destinations` port, **optionally**: a kind
      that cannot answer says so, and a kind that has not implemented it is the same answer.
      The method is **`candidates`** — `enumerate` is the tree walk this plan stopped being
- [x] A request names the capability, the field, and an opaque **scope** the destination minted in
      an earlier answer. The scope is what makes descending possible without the port knowing what
      a path is. It does **not** carry the arguments filled in so far: the route is a `GET` and
      cannot supply them, no field of either kind depends on another today, and a parameter no
      caller can fill is worse than one added when a kind needs it
- [x] An answer is entries, each with a label to read, the value the field would take, and — where
      the destination offers it — the scope to ask again with, which is how a tree is walked by a
      caller that was never told it is a tree. Plus whether the answer was cut short, which phase 7
      explains
- [x] Failures are the ones this domain already has: **unreachable** when the destination could not
      be asked, **unusable** when nothing speaks its kind, and **not-offered** when the kind does not
      do this
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`
- [x] `git commit`

### Phase 4 — An argument schema good enough to build a form from

Depends on phase 3.

- [x] A field of an `argumentsSchema` can say that it **can be asked about**. One bit, not a
      taxonomy: the first draft of this plan proposed two values, one for a collection and one for
      an item, and every new sort of place would have cost a third that both core and the shell had
      to learn — which is core.md:611's rejected fixed set, one level down
- [x] **The channel is a vendor-prefixed keyword**, `x-notemap-candidates`, carrying a boolean.
      JSON Schema permits unknown keywords, core validates the schema and does not interpret
      annotations, and with one bit to carry there is nothing to gain from overloading `format` and
      a strict validator to lose
- [x] Both kinds annotate, and the rest of what [todo.md](../todo.md) line 15 asks for lands with
      it: titles and descriptions on every argument field of both kinds. The composer draws
      unlabelled inputs today because there is nothing to label them with, and that is the schema's
      fault rather than the shell's
- [x] Verify: `pnpm -r --silent test`
- [ ] `git commit`

### Phase 5 — The filesystem kind answers

Depends on phases 3 and 4.

- [ ] One level, through the existing containment: a scope that leaves the root is refused by the
      same rule a delivery is refused by, symlinks included. Sorted by name
- [ ] The scope is the path relative to the root, because that is what the field takes — the value
      and the way to descend are the same string here, and will not be for every kind
- [ ] What is offered follows the field, not the kind: `create-file`'s `directory` offers folders,
      `append-to-file`'s `path` offers notes
- [ ] Hidden files and the `.notemap-*` temporaries a crashed delivery leaves are not offered
- [ ] Unreadable or absent is `unreachable` with the reason, never an empty listing: a vault that is
      not mounted and a vault that is empty are different answers to a person looking for a folder
- [ ] Tests beside the adapter, over a temporary tree
- [ ] Verify: `pnpm -r --silent test`
- [ ] `git commit`

### Phase 6 — The webdav kind answers

Depends on [destination-webdav](destination-webdav.md). Drops out of this plan if that has not
landed, and the plan still ships.

- [ ] `PROPFIND` with `Depth: 1`, which is one request for one level and is what the method was
      designed for. Resource type says whether it can be descended into; the display name and the
      href give the label and the value
- [ ] The same exclusions and the same failure vocabulary as phase 5, so a composer cannot tell the
      two kinds apart except by what is in them
- [ ] Tests against the same in-process DAV server the webdav kind is tested against
- [ ] Verify: `pnpm -r --silent test`
- [ ] `git commit`

### Phase 7 — On the wire

Depends on phase 3, and on at least one of phases 5 and 6.

- [ ] `GET /v1/destinations/{id}/candidates`, taking the capability, the field and the scope as
      query parameters. It sits beside `/description` and is the same animal: a question the
      destination answers, slowly, and may refuse. A read is a `GET` — `http-v1.md` has no stance
      on a read that posts and this route is not the place to open one
- [ ] **It is capped, not paginated**, and says when it cut the answer short. A folder holding five
      thousand notes is a search problem rather than a paging problem, and paginating it would put a
      position on somebody else's directory listing — an ordering notemap does not own and cannot
      promise is stable between two reads. If browsing something that large turns out to matter, the
      honest fix is a filter parameter, not a cursor
- [ ] Refusals map onto the table `http-v1.md` already keeps: unreachable, unusable, and the kind
      not offering this at all
- [ ] Route tests beside the route, and the OpenAPI document regenerated
- [ ] Verify: `pnpm --filter @notemap/daemon test`
- [ ] `git commit`

### Phase 8 — The client asks, and does not remember

Depends on phase 7.

- [ ] The client can ask, and holds the answer in memory for as long as a composer is open —
      **and no longer**. It does not go in the durable store: that cache answers for the pool's own
      collections, and a vault's contents are somebody else's state, stale the moment somebody else
      writes a file. Answering a folder listing from disk while offline would be the client claiming
      something it cannot know
- [ ] Out of reach is out of reach: the composer says so and offers typing, which is what it does
      today. Nothing here is allowed to make routing impossible when the vault is asleep — the
      decision is still a person's to make and the delivery is still deferrable
- [ ] Tests in the client package, including that nothing was written to the store
- [ ] Verify: `pnpm --filter @notemap/client test`
- [ ] `git commit`

### Phase 9 — The composer walks it

Depends on phases 4 and 8.

- [ ] A field that can be asked about draws a browser instead of a bare input: the entries at the
      current scope, a way back to the one before it, and a way to take the scope you are standing
      in. In the register's own language — this is the marked-option idiom the `where` and `do`
      steps already use, not a second visual vocabulary
- [ ] Free entry stays, beside it. A folder that does not exist yet cannot be browsed to, and
      `create-file` into a new folder is a thing people do
- [ ] A destination that cannot be asked, or a kind that does not offer this, is the field as it is
      today with a line saying why. Nothing about it is an alarm: it is the ordinary condition
- [ ] The other argument fields draw the titles and descriptions phase 4 gave them
- [ ] **The control a field gets is chosen through a lookup that can be keyed by destination kind**,
      with the schema-driven control as the fallback for every kind that registers nothing. No
      per-kind control is registered in this plan and none is designed; what is being built is the
      seam, so that the day a vault picker wants search-as-you-type and a breadcrumb it is a
      component registered for two kinds and nothing else moves
- [ ] Tests in `RoutingComposer.test.ts`: a field that can be asked about is browsed, a refusal
      falls back to typing, a typed value that was never listed still routes, and an unregistered
      kind gets the schema-driven control
- [ ] Verify: `pnpm --filter @notemap/ui test`, and by hand against the real vault
- [ ] `git commit`

### Phase 10 — The specs say so

Depends on everything above. `security.md` is not here: phase 2 writes it, beside the code it
describes.

- [ ] `core.md` gains the method, the word `arguments`, and why this is not `describe()`;
      `http-v1.md` the route and the cap; `client.md` that this answer is never cached durably and
      why; `shell.md` the browser and the per-kind seam, which also settles that spec's
      "**Not shipped**: the folder tree, which nothing can enumerate"
- [ ] `docs/todo.md`: line 66 closes, line 15's schema half closes with it, and line 2's "advertise
      folders" half closes — its tags half is now something the port can answer and no kind does.
      Preview stays open and names the plan that carries it
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm test:stack` — this
      crosses core, the HTTP surface, the client and the shell, which is exactly what that suite is
      for
- [ ] `git commit`

---

## Unknowns

- ~~**The method's name.**~~ Settled 2026-08-31: `candidates`.
- ~~**The annotation's channel.**~~ Settled 2026-08-31: `x-notemap-candidates`, a vendor-prefixed
  keyword carrying a boolean.
- ~~**Whether the request needs the arguments filled in so far.**~~ Settled 2026-08-31: not in this
  slice, and not in the port either. No enumerable field of either kind depends on another, so the
  first kind that needs one pays for it — and pays for the route shape it forces at the same time.
- **Whether the cap is felt.** An Obsidian vault with a flat folder of a few thousand notes is not
  unusual, and `append-to-file` lists notes rather than folders. Fallback is a filter parameter — a
  name fragment the adapter applies — before anything resembling a cursor.
- **Whether saving a colliding root should be refused outright** rather than reported `unusable`
  immediately afterwards. Refusing the save means core asking the adapter about settings, which is
  a port method this plan otherwise does not need. Fallback is what phase 2 builds.
- **Enumeration latency over WebDAV on a large vault**, where the filesystem kind is instant. If a
  `PROPFIND` on a big collection is slow enough to be felt, the composer needs to say it is asking,
  which it should probably do regardless.
- **Whether a person wants to browse at all on a phone.** The typed value is the fallback
  everywhere, so the risk is only wasted work in the shell; worth watching during phase 9's hand
  verify.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Phase 1's whole evidence is the existing suite passing with nothing rewritten but field names.
Each adapter is tested where it lives — a temporary tree for the filesystem, the in-process DAV
server for webdav — the route and the client in their own packages, and the composer in the shell's
suite. Phases 1 and 10 run `pnpm test:stack`, because a wire shape and a new route are precisely
what crosses every layer.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
