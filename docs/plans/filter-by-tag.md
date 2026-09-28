# Filter the queue and the feed by tag

**Date**: 2026-09-28 *(decisions settled in a grilling session the same day)*
**Status**: Done <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**: 2026-09-28 *(the running-shell walk-through in phase 4 is left to the developer)*

---

## Goal

> On the queue and on the feed, a person can list every tag with how many items carry it on that
> surface, and put a **filter** of one or more tags on the surface — every tag carried — paging
> the whole filtered reading from the pool, and from the cache when offline. Trigger tags are
> listed apart.

The first half of the batch-processing item in [todo.md](../todo.md). What is **not** built here:
selecting several rows, acting on a filtered set, filtering from a tag on a row or the item
surface, and renaming, merging or deleting a tag. The next plan acts on what this one filters to.

---

## Decided

The terms are **Filter** and **Tags in use** in [CONTEXT.md](../../CONTEXT.md), already amended.

**The pool**

- `tag=` on `GET /v1/feed`, `/v1/queue` and `/v1/archived`. It may be repeated, and every tag
  must be carried (AND). It is carried by `next`.
- A value that trims to nothing is `422 tag-invalid`. Duplicates are absorbed, and there is no
  cap. A tag no item carries answers an empty page.
- `GET /v1/tags` rows become `{ name, items, unprocessed }`. This amends http-v1's "the tag and its
  count are the whole of a row". The route takes no filter *(amended the same day — see below)*.

**The client**

- The pool answers a filtered read. Offline, the client filters its cache the same way, and the
  surface says it was drawn from the cache, as surfaces already do.
- Per surface the client holds the whole page **and** one filtered page. Changing the filter
  replaces the filtered page; lifting it returns to the whole page as it stood.
- One membership rule decides whether a row belongs: the surface, plus the filter, plus the
  client's copy of the item.
  - A row whose filter tag is taken off is held while selected, then leaves.
  - An item tagged into the filter joins the page where the page reaches, as `settle` already
    does for the queue.
- The watcher applies `tagged`/`untagged` actions (whose `detail` carries the tag) to cached
  items, so cached tags stop going stale and filtered pages follow other devices. An item the
  client does not hold waits for the next read, which is the rule unarchive already lives by.
- The whole-pool tags list stays in `ClientState.tags`; the chooser and the filter both read it.

**The shell**

- A `tags ▾` dropdown beside the order *(amended the same day — see below)*, opened by `f`. A line
  narrows it as it is typed into; ordinary tags first, then a band of trigger tags in trigger
  style, each naming its template.
  - Counts are this surface's: `unprocessed` on the queue, `items` on the feed. A tag counting
    zero is not offered unless it is in the filter, and a band with no rows is omitted.
  - A press or `⏎` takes a tag into the filter or out of it, and the panel stays open. Any set can
    be taken, one no item carries all of included.
- Rows underline the tags they carry that the surface is filtered by.
- The filter is `tag=` on the URL only and never remembered, so a surface opened afresh is the
  whole of it. Changing the filter **pushes** a history entry; changing the view still
  **replaces** its entry.
- The head reads `tagged` and each tag ruled round with its `×`, as a carried tag is once pressed;
  each `×` takes that tag off. `esc` with no row selected takes off the tag added last.
- An emptied filter never draws the drained queue's line. The queue says `nothing tagged … is
  waiting`, with `whole queue` beside it; the feed says `nothing is tagged …`.

**Docs**

- Where the specs call a surface's own condition a filter ("read through three filters", "the
  archive is a filter, not a terminus"), the wording changes so that *filter* means only what a
  reader adds. Done in the phase that touches each spec.

---

## Tasks

### Phase 0 — branch

- [x] Branch `agent/filter-by-tag`. _(2026-09-28)_

### Phase 1 — the pool filters (core, store)

- [x] core.md: the three surface reads take an optional tag filter, tags in use carry
      `unprocessed` and answer through a filter, and the loose uses of *filter* are reworded.
- [x] `PoolReads.feed/queue/archived` take an optional set of tags. The `Pool` API normalises
      each one as tagging does and refuses a blank one as `tag-invalid`.
- [x] `TagUse` gains `unprocessed`. `tagsInUse` takes an optional filter and answers what
      co-occurs with it, counted within it.
- [x] Store: the filter as one `EXISTS` over `item_tags` per tag, and a migration adding an index on
      `item_tags (name, item_id)`.
- [x] Tests beside the store and core:
  - [x] two-tag AND under both orders and across a position
  - [x] a tag nothing carries
  - [x] duplicates absorbed
  - [x] `unprocessed` excluding archived, routed and revised items
  - [x] co-occurring counts under a filter
- [x] Typecheck, `pnpm -r --silent test`, lint; commit.

**Verify**: store tests show a filtered queue page continuing from a feed position, and counts
matching a hand-counted fixture.

### Phase 2 — on the wire (daemon)

Depends on: phase 1.

- [x] http-v1.md:
  - [x] `tag` on the three routes and on `/v1/tags`
  - [x] `next` carrying it
  - [x] the blank-value refusal
  - [x] `unprocessed` on the row, and the amended "whole of a row" paragraph
  - [x] the reworded loose *filter*s
  - [x] acceptance criteria
- [x] Route schemas, OpenAPI, and regenerated client types.
- [x] Route tests:
  - [x] repeated `tag` round-trips through `next`
  - [x] a blank `tag` is `422 tag-invalid`
  - [x] a tag containing `/` survives the query string
- [x] Typecheck, tests, lint, `pnpm test:stack`; commit.

**Verify**: `GET /v1/queue?tag=a&tag=b&limit=1` answers a `next` carrying both tags, and
`GET /v1/tags?tag=a` answers only tags carried beside `a`.

### Phase 3 — the client holds a filtered page

Depends on: phase 2.

- [x] client.md: the whole page and the filtered page, the membership rule, the watcher applying
      tag actions, the offline filtered draw, and the filtered tags read.
- [x] State: a filtered `ListPage` beside each surface's whole page. `reads` sends the filter.
- [x] One membership rule replaces the bare `unprocessed` checks in `settle`, `arrived`,
      `caughtUp` and `drawnFrom`, and applies to both pages.
- [x] `caughtUp` applies `tagged`/`untagged` to cached items.
- [x] Retention: the filtered page's ids are exempt from the cap, like any drawn page.
- [x] A client call for the filtered tags read; offline, it counts from the cache and says it did.
- [x] Tests beside `state`, `surfaces` and `actions`.
- [x] Typecheck, tests, lint; commit.

**Verify**: client tests where:
- a filtered queue page drops a row untagged on another device, via the watcher
- lifting the filter restores the whole page without a read from the top
- an offline filtered draw matches the cached items carrying every tag

### Phase 4 — the shell lists and filters

Depends on: phase 3.

- [x] shell.md: the tags view, the filtered head, the keyboard, history, the empty filter, and
      `tag=` on the URL.
- [x] `lib/`: `tag=` read and written, pushed, never persisted. `view=tags` read from the URL and
      never remembered.
- [x] The tags view: two bands, counts for this surface, zero rows hidden, walked and taken like
      the index.
- [x] The filtered head with its `×`s. `esc` with no row selected takes off the last tag added.
- [x] The empty-filter lines on the queue and the feed.
- [x] Component tests on the queue and the feed.
- [x] Typecheck, tests, lint, `pnpm test:stack`; commit.

**Verify**: in the running shell:
1. Queue: `f`, take one tag, then a second from the same panel. The rows and counts agree and
   scrolling pages further.
2. Back lifts one tag. `esc` lifts the other. The whole queue is where it was left.
3. The same steps offline draw from the cache.

### Phase 5 — shipped entries

- [x] `Shipped:` entries in the four specs; set Status.

---

## What changed on the way

- **The feed holds a selected row too.** Nothing ever left the whole feed, so it had no hold; a
  filtered one loses a row whose tag is taken off, and now keeps it where it stood until the
  selection leaves it, as the queue does.
- **The tags view became a dropdown, and the reading beside a filter went with it** (decided by
  the developer after the first PR round). A third view taken a tag at a time meant going back and
  forth once per tag. The `tags ▾` panel beside the order takes several without leaving the list,
  and lets any set be taken — a filter no item answers is informative, not an error. With that,
  nothing asked for the tags carried beside a filter, so `tag=` on `GET /v1/tags`, the store's
  co-occurrence query and the client's `tags.within` were removed. The panel reloads the whole list
  as it opens, the held counts going stale as items are processed. Filter tags on a row are
  underlined: the shell has no accent colour to mark them with.
- **Not done by the agent:** the phase 4 walk-through in a running shell. Every step of it is
  covered by a component or client test, but none of them is a browser.

## Unknowns

- **The cost of the `unprocessed` count.** It evaluates the queue's two `NOT EXISTS` subqueries
  per tagged row. That is fine at one person's scale. If it isn't, the fallback is a second
  grouped query joined in code, with no change to the wire.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
