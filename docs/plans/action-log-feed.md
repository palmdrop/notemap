# The action log, read end to end

**Date**: 2026-08-11
**Status**: Todo
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`
**Closed**:

---

## Goal

The action log is **stated** in core.md and http-v1.md, and **readable** end to end:
`GET /v1/actions` answers a position-paginated slice, newest first by default and optionally
narrowed to one item, and a page the daemon serves at `/log` renders it and pages through it.

The log is not unbuilt — it is under-specified. The entry type, the append, the table and a
paginated read all exist; what is missing is a spec saying what any of it guarantees, an order a
human can read it in, and any way to see it without opening the database.

**Out of this slice, deliberately**:

- `actions.clear`. Nothing purges yet, so the operation ADR 12 promises has no real use to be
  tested against. Its refusal type is corrected here anyway, so purge's slice inherits an API of
  the right shape rather than one it has to change on arrival.
- Retention. ADR 12 left it open and the log is three kinds wide; it is recorded as an open
  question in core.md rather than invented here.
- Filtering by kind or by agent. The read takes a query object so that adding one later changes
  no signature, and nothing needs one today.
- A per-kind shape for `detail`. It stays open JSON, with the rule stated.

---

## Decisions taken before this plan

2026-08-11, with the developer:

- **The read takes an order, defaulting to newest-first.** The same call ADR 10 and ADR 14 made
  for the feed: a position belongs to no direction, and which end a reader starts from is the
  reader's. A log read oldest-first only — which is what the store does today — cannot show the
  latest entries of a growing log at all.
- **Ordering is core's, and the port carries it.** Core resolves the default and hands the store
  an order it must honour; the store holds no default of its own. The port taking an *optional*
  order is what let the SQLite driver own the policy in the first place.
- **One route with a filter**: `GET /v1/actions?item=<id>`, not a nested
  `/v1/items/{id}/actions`. One handler, one place composing `next`, and the core read becomes
  `actions(query, page)` so a `kinds` filter later costs no signature change.
- **`detail` stays open JSON**, and the rule that it carries facts and never a sentence is
  stated — the same rule a refusal follows. The one existing wart is fixed: `work-failed` writes
  `detail.detail` today.
- **Failed attempts are logged; successful ones are not.** Successful work that produces material
  is already in the log as that material, and the one case with no product — a mirror write — has
  the file as its trace. The alternative was an entry per successful write, which is an entry per
  mutation per item on the surface a person reads.
- **Reads only** this slice; `clear` stays unimplemented.
- **The spec is a section in core.md, and it does not enumerate the kinds.** The action log has
  no format and no protocol, which is what earned `mirror.md` and `sync.md` their own documents.
  The kind list is `ActionKind`'s, and the code documents it.

---

## Tasks

### Phase 0 — Branch

- [x] `git checkout -b agent/action-log-feed` _(2026-08-11)_

### Phase 1 — Say what the log is *(blocks everything)*

Docs and code land in the same change, so the contract is written before the code that answers
to it. Nothing here restates ADR 12's reasoning; the spec states observable behaviour.

- [x] core.md: a **"The action log"** section. It states that every state-mutating action appends
      an entry in the same atomic unit as the change; what an entry carries — what happened, the
      agent, the time core applied it, the subject where it has one, and facts; that `detail`
      carries facts and never a sentence; that the log is read ordered and paginated by position,
      newest first by default, optionally narrowed to one subject; and that state is never derived
      from it. It does **not** list the kinds. *Placed after "The mirror" rather than after
      "Archive and purge" as this task said*: the sections before the queue run the item's
      lifecycle, and a cross-cutting record reads better beside the other one than wedged into
      that run
- [x] core.md: state that **a subject filter naming something the pool does not hold answers an
      empty page, never a refusal.** The log outlives the material by design, so the entries of a
      purged item are exactly what someone asks for, and reads are exempt from refusal anyway
- [x] core.md: state that the log records **arrival**, not capture time — the thing nothing else
      in the model records
- [x] core.md: tighten "**every attempt is an entry in the action log**" (Enrichment) to failed
      attempts, and say why rather than editing it silently: work that produces material already
      appears as its product — `artifact-added` for enrichment, `routed` for delivery — so a
      success entry beside it would record the attempt twice. A mirror write is the one success
      with no product, and its trace is the file it wrote. This is the spec moving to meet the
      code
- [x] core.md: acceptance criteria — an entry timed by arrival while capture time is three days
      old; a failed attempt appears and a successful one does not; a filter on an id no item has
      answers that item's entries; one position continues a read in either direction
- [x] core.md: open question, dated — **retention**: whether entries expire at all and whether
      expiry is per kind, carried over from ADR 12 rather than left only there
- [x] http-v1.md: the action log joins the resource model in Scope, and `GET /v1/actions` joins
      the settled list
- [x] http-v1.md: a **"The action log"** section — the parameters (`order`, `limit`, `after`,
      `item`), the slice shape, `next` as a ready-to-fetch relative URL carrying the filter, and
      that **`item` is never validated and never 404s**. No new refusal codes: `bad-order`,
      `bad-limit`, `limit-too-large` and `bad-position` already say everything this route refuses
- [x] http-v1.md: name the log page beside `/` and `/docs` in Transport, and say it is host
      surface outside the contract, on the same terms `/docs` is
- [x] Verify: `pnpm format:check`, and the two specs read back as one contract — every guarantee
      phase 2–5 is verified against is written down
- [ ] `git commit`

### Phase 2 — Core: the read, and the append discipline *(depends on phase 1)*

- [x] Generalise the order off the feed: `FeedOrder` becomes `ReadOrder`, `FeedPage` becomes
      `OrderedPage<P = Position>`, and both the feed and the log take it. No alias left behind —
      two names for one thing is how they drift
- [x] **The default moves into core, and the port stops accepting its absence.** Newest-first
      lives in the SQLite driver today (`DEFAULT_ORDER`), which makes it the driver's policy — a
      second store could disagree with core.md and nothing would catch it. `OrderedPage`'s order
      is **required** on `PoolReads`, and optional only on the pool API a caller reaches, where
      core fills it in. A driver cannot default what it is always given
- [x] The feed's existing tests assert the default through the store; they move to asserting it
      through core, which is where the guarantee now lives. *Already there*: the integration suite
      covers it ("reads newest first when the caller says nothing"), so the store test stopped
      asserting a default rather than a new test being written
- [x] `PoolReads.actions(query, page)` where the query is `{ item?: ItemId }`. `ActionsApi`'s
      `forItem`/`all` stay as the ergonomic split over it — `actions(undefined, page)` at a call
      site says nothing about what the undefined means
- [x] A `recordAction` helper in `pool/` that mints the id and appends. *`at` is the caller's
      rather than the helper's*: capture already reads the clock for the mirror job it enqueues,
      and two reads in one transaction would put the entry a moment after the change it records.
      Capture
      and `work.complete` hand-roll all three today, which is how the shape drifts; ADR 12's
      amendment already concedes the coupling is discipline, and this is what makes the discipline
      one grep
- [x] `work-failed`/`work-abandoned` detail becomes `failure: { code, detail }` rather than the
      failure's fields spread beside `work` and `attempt` — `detail.detail` reads as a mistake
      because it is one
- [x] `ActionLogRefusal` stops being `SubjectRefusal` — it is `never`, since clearing has nothing
      left to refuse. Clearing a **purged** item's entries is the
      case the operation exists for, and `no-such-item` refuses exactly then — the same reasoning
      that took the foreign key off a job's subject. `clear` stays `notImplemented`
- [x] Verify: `pnpm typecheck && pnpm test`
- [x] `git commit` — *one commit with phase 3*: a port whose signature changed does not compile
      apart from the driver that answers it, and a commit that does not build is not a commit

### Phase 3 — Store: ordered and filtered *(depends on phase 2)*

- [x] `actions` honours the order in both directions — `at DESC, id DESC` with a `<` keyset, or
      ASC with `>`. `keysetPage` already serves the feed; it gains a direction rather than being
      copied
- [x] New migration — never edit one that has run — replacing `actions_at` and `actions_subject`
      with `(at, id)` and `(subject, at, id)`, so the index covers the order the keyset actually
      reads in. Behaviour is unchanged; a log that grows without this reads by sorting
- [x] Tests: newest-first paging to exhaustion with no trailing empty page; one position
      continuing a read in either direction; the subject filter surviving a page boundary in both
      orders; **entries whose subject names no item are returned** — appendable today, since the
      table deliberately carries no foreign key, and the case purge will produce
- [x] Verify: `pnpm --filter @notemap/store-sqlite test`
- [x] `git commit` — with phase 2, per the note above

### Phase 4 — `GET /v1/actions` *(depends on phase 3)*

- [x] Generalise the query reader: `readFeedQuery` parses order, limit and position for one route
      and refuses in the four ways both routes refuse. Lift it, and lift `feedUrl` with it — it
      hardcodes `/v1/feed` and the actions route has to carry `item` through into `next`
- [x] `schemas/action.ts`: the entry and the slice. The agent union **includes `notemap`** here,
      where `item.tags[].by` does not — a tag is always somebody's, and work core drives is not
- [x] The route definition, the handler, and `ROUTES`. `item` passes through unvalidated: any
      string is a legal filter and an unmatched one is an empty page
- [x] Regenerate the checked-in document — `pnpm --filter @notemap/daemon openapi` — in the same
      commit as the route that changed it
- [x] Tests: the default page is newest-first; following `next` yields every entry exactly once;
      `item` narrows; an `item` no pool holds is `200` with an empty page and never `404`;
      `limit=501` is `limit-too-large`; a malformed `after` is `bad-position`. *One test the
      route cannot carry yet*: a filtered read that has a next page needs two entries about one
      item, and no mutation but capture exists to write the second — the filter surviving into
      `next` is covered as a unit test over `pageUrl`, and across a page boundary in the store
- [x] Verify: `pnpm --filter @notemap/daemon test`
- [x] `git commit`

### Phase 5 — The page at `/log` *(depends on phase 4)*

- [ ] `public/log.html`, following the capture page's conventions — no framework, no build step,
      system colours. Time, kind, agent, subject and the detail rendered generically, since
      `detail` is open by decision; "Load more" follows `next`; a link each way between `/` and
      `/log`
- [ ] `src/log/page.ts` reading it from `PUBLIC_DIR` and caching, as `page.ts` and `docs/page.ts`
      do, and the route registered in `app.ts`. `OPTIONS` and `405` fall out of `methodsFor`
- [ ] Daemon README: the third page, and what it is for
- [ ] Tests: `/log` serves the page; it appears nowhere in `GET /v1/openapi.json`, on the same
      terms `/docs` does not
- [ ] Verify: `pnpm --filter @notemap/daemon test`, then `pnpm dev` — capture something on `/`,
      see the entry on `/log`, and page past the end of it
- [ ] `git commit`

### Phase 6 — End to end, and close *(depends on phase 5)*

- [ ] Integration tests in `tests/integration/`: a capture's entry is timed by arrival while its
      capture time sits three days earlier; a failed mirror attempt appears attributed to
      `notemap` carrying the corrected failure shape, and a successful one appears not at all;
      newest-first ordering holds across a page boundary
- [ ] Verify: `pnpm typecheck && pnpm test && pnpm lint && pnpm format:check`
- [ ] Set **Status**, add the `Shipped:` entries to both specs, `git commit`

---

## Unknowns and pending decisions

- **`ReadOrder` / `OrderedPage` as names.** Settled at implementation; if the rename churns more
  than it clarifies, the fallback is keeping `FeedOrder` and `FeedPage` and reusing them
  unrenamed for a surface that is not the feed — worse names, no behaviour lost.
- **`/log` versus `/actions`** as the page path. `/log` does not read like the API route it is
  not. Low stakes, decide while building.
- **Whether a subject on the page links to `/v1/items/:id`.** It is one anchor; the reason not to
  is that a purged item's entries would link to a `404`, which is honest but ugly.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Three properties are worth testing hardest, because each is silent when wrong:

- **The log outlives its subject.** A filter that quietly drops entries whose item is gone breaks
  the log for the one case it is most wanted in, and looks like an empty page rather than a bug.
- **One position, both directions.** A keyset comparison flipped with the order is the classic way
  a page silently skips or repeats rows.
- **Arrival, not capture time.** The entry is the only place arrival is recorded; nothing else in
  the pool disagrees with it loudly enough to notice.

Adapter tests live with their package; cross-package behaviour goes in `tests/integration/`.

---

## Notes

Every mutation that changes state appends its own entry, and only `capture` and `work.complete`
exist to do so today. The rule belongs to each mutation as it is built — `edit`, `tag`, `archive`,
`route`, `accept`, `purge` each own their append when they land — not to a sweep afterwards. This
slice makes that cheap to do right and easy to check; it cannot make it automatic.

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what
was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`.
**Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what
landed and linking back to this plan. No implementation details, no granular tasks. A plan marked
Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
