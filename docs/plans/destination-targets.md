# A destination can be asked what it holds

**Date**: 2026-08-26
**Status**: Todo
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**:

---

## Goal

Routing into a real vault becomes choosing rather than typing. A destination can be asked what it
holds at one path — folders and files, one level at a time — and the routing composer draws that as
something to walk, so `10 Areas/Projects/Quotes` is arrived at rather than remembered. Typing a path
that does not exist yet stays possible, because creating a note in a new folder is a legitimate
thing to want.

This closes [todo.md](../todo.md)'s "nothing can enumerate a destination's targets", and it is the
same seam routing preview will need — a destination answering a question about itself that is slow,
allowed to fail, and not part of what it *is*. Building it once for both is the point.

Not in this plan: preview itself, templates, and rules. This adds the method and one caller.

---

## Tasks

### Phase 1 — the decision, and the port

Depends on nothing.

- [ ] Create branch `agent/destination-targets`
- [ ] An ADR: **a destination can be asked what it holds**, and it is a method of its own rather
      than an enum refreshed at `describe()`. The reasoning worth keeping: `describe()` deliberately
      touches neither disk nor network, because an unmounted drive and an unreachable Nextcloud must
      still be *routable* with the delivery deferred — folding enumeration into it would make every
      settings screen and every routing picker stall on a destination that is merely asleep. And it
      is answered one level at a time, because a vault has thousands of notes and an adapter that
      answers "everything" is one nobody can use twice
- [ ] `enumerate` joins `DestinationKindAdapter` and the `Destinations` port, **optionally**: a kind
      that cannot answer says so, and a kind that has not implemented it is the same answer. A
      request names the capability, the path, and whether the caller wants collections, items or
      both — `create-file` wants folders, `append-to-file` wants notes
- [ ] What comes back is entries, each with a name, a path stated as the target field would take it,
      and whether it is a collection or an item. Plus whether the answer was cut short, which
      phase 5 explains
- [ ] Failures are the ones this domain already has: unreachable when the destination could not be
      asked, unusable when nothing speaks its kind, and not-offered when the kind does not do this
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`
- [ ] `git commit`

### Phase 2 — a target schema good enough to build a form from

Depends on phase 1.

- [ ] A string field in a `targetSchema` can say that it names a place **in the destination**, and
      which sort of place. Proposed: JSON Schema `format`, since core validates the schema and does
      not interpret annotations, so nothing in core learns what a folder is. Two values, one for a
      collection and one for an item
- [ ] Both kinds annotate: the filesystem kind's `directory` and `path`, and the webdav kind's, if
      [destination-webdav](destination-webdav.md) has landed
- [ ] While here, the rest of what [todo.md](../todo.md) line 15 asks for: titles and descriptions
      on every target field of both kinds. The composer currently draws unlabelled inputs because
      there is nothing to label them with, and that is the schema's fault rather than the shell's
- [ ] Verify: `pnpm -r --silent test`
- [ ] `git commit`

### Phase 3 — the filesystem kind answers

Depends on phases 1 and 2.

- [ ] One level, through the existing containment: a path that leaves the root is refused by the
      same rule a delivery is refused by, symlinks included. Sorted by name
- [ ] Hidden files and the `.notemap-*` temporaries a crashed delivery leaves are not offered.
      Neither is anything the caller did not ask for — a folder chooser lists folders
- [ ] Unreadable or absent is `unreachable` with the reason, never an empty listing: a vault that is
      not mounted and a vault that is empty are different answers to a person looking for a folder
- [ ] Tests beside the adapter, over a temporary tree
- [ ] Verify: `pnpm -r --silent test`
- [ ] `git commit`

### Phase 4 — the webdav kind answers

Depends on [destination-webdav](destination-webdav.md). Drops out of this plan if that has not
landed, and the plan still ships.

- [ ] `PROPFIND` with `Depth: 1`, which is one request for one level and is what the method was
      designed for. Resource type says collection or item; the display name and the href give the
      name and the path
- [ ] The same exclusions and the same failure vocabulary as phase 3, so a composer cannot tell the
      two kinds apart except by what is in them
- [ ] Tests against the same in-process DAV server the webdav kind is tested against
- [ ] Verify: `pnpm -r --silent test`
- [ ] `git commit`

### Phase 5 — on the wire

Depends on phase 1, and on at least one of phases 3 and 4.

- [ ] `GET /v1/destinations/{id}/targets`, taking the capability, the path and what sort of entry is
      wanted. It sits beside `/description` and is the same animal: a question the destination
      answers, slowly, and may refuse
- [ ] **It is capped, not paginated**, and says when it cut the answer short. A folder holding five
      thousand notes is a search problem rather than a paging problem, and paginating it would put a
      position on somebody else's directory listing — an ordering notemap does not own and cannot
      promise is stable between two reads. If browsing a folder that large turns out to matter, the
      honest fix is a filter parameter, not a cursor
- [ ] Refusals map onto the table `http-v1.md` already keeps: unreachable, unusable, and the kind
      not offering this at all
- [ ] Route tests beside the route, and the OpenAPI document regenerated
- [ ] Verify: `pnpm --filter @notemap/daemon test`
- [ ] `git commit`

### Phase 6 — the client asks, and does not remember

Depends on phase 5.

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

### Phase 7 — the composer walks it

Depends on phases 2 and 6.

- [ ] A target field annotated as a place in the destination draws a browser instead of a bare
      input: the entries at the current path, one level, with a way back up and a way to take the
      path you are standing in. In the register's own language — this is the marked-option idiom the
      `where` and `do` steps already use, not a second visual vocabulary
- [ ] Free entry stays, beside it. A folder that does not exist yet cannot be browsed to, and
      `create-file` into a new folder is a thing people do
- [ ] A destination that cannot be asked, or a kind that does not offer this, is the field as it is
      today with a line saying why. Nothing about it is an alarm: it is the ordinary condition
- [ ] The other target fields draw their titles and descriptions from phase 2
- [ ] Tests in `RoutingComposer.test.ts`: a browsable field browses, a refusal falls back to typing,
      and a typed path that was never listed still routes
- [ ] Verify: `pnpm --filter @notemap/ui test`, and by hand against the real vault
- [ ] `git commit`

### Phase 8 — the specs say so

Depends on everything above.

- [ ] `core.md` gains the method and why it is not `describe()`; `http-v1.md` the route and the cap;
      `client.md` that this answer is never cached durably and why; `shell.md` the browser, which
      also settles that spec's "**Not shipped**: the folder tree, which nothing can enumerate"
- [ ] `docs/todo.md`: line 66 closes, and line 15's schema half closes with it. Preview stays open
      and now names the seam it will use
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm test:stack` — this
      crosses core, the HTTP surface, the client and the shell, which is exactly what that suite is
      for
- [ ] `git commit`

---

## Unknowns

- **Whether `format` is the right channel** for saying a field names a place. It is unenforced
  vocabulary in JSON Schema, which is what makes it free; a validator configured to be strict about
  formats would be the thing that objects. Fallback: a vendor-prefixed keyword, uglier and
  unambiguous.
- **Whether the cap is felt.** An Obsidian vault with a flat folder of a few thousand notes is not
  unusual, and `append-to-file` wants to list notes rather than folders. Fallback is a filter
  parameter — a name fragment the adapter applies — before anything resembling a cursor.
- **Enumeration latency over WebDAV on a large vault**, where the filesystem kind is instant. If a
  `PROPFIND` on a big collection is slow enough to be felt, the composer needs to say it is asking,
  which it should probably do regardless.
- **Whether a person wants to browse at all on a phone.** The typed path is the fallback everywhere,
  so the risk is only wasted work in the shell; worth watching during phase 7's hand verify.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Each adapter is tested where it lives — a temporary tree for the filesystem, the in-process DAV
server for webdav — the route and the client in their own packages, and the composer in the shell's
suite. Phase 8 runs `pnpm test:stack`, because this is precisely the sort of change that crosses
every layer.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
