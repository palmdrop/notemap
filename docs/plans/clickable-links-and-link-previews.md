# Clickable links, and a preview of what they point at

**Date**: 2026-09-23 *(open questions answered 2026-09-24; the opt-out split out 2026-09-24)*
**Status**: In progress <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/shell.md`, `docs/specs/http-v1.md`, `docs/specs/security.md`
**Depends on**: [a-pool-holds-settings](a-pool-holds-settings.md), which must be `Done` before phase 3
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> A bare URL typed into a capture is a link a person can follow, and a link pointing outside
> notemap draws what is at the other end of it — a title, a picture, a line of description — read
> by the daemon rather than by the browser, held in memory with a lifetime, never pool state, and
> turned off for every device at once by one **pool setting** that is.

Two halves of very unequal size. The first is two files and a dependency. The second is a new
route, a new kind of outbound request, and a term the glossary does not have.

**The opt-out is not built here.** It needed a **pool setting**, a concept notemap did not have,
and building that concept is its own plan:
[a-pool-holds-settings](a-pool-holds-settings.md). This plan consumes it and does not
reinvent it — see [The opt-out is somebody else's plan](#the-opt-out-is-somebody-elses-plan).
Phase 1 stands alone and should ship without waiting for any of it.

---

## What is already there

Read before planning, so the plan argues with the code rather than around it.

- **Markdown-syntax links already work.** `apps/ui/src/lib/markdown.ts` renders every note,
  output and note-about-an-output through one `micromark` call, and filters every `a[href]` it
  produces through `followable()` in `apps/ui/src/lib/link.ts`, which keeps `http` and `https`
  and drops the rest. `[text](url)` and `<url>` are links today.
- **Bare URLs are not.** CommonMark autolinks nothing but the angle-bracket form. `https://…`
  typed in prose comes out as text, which is the whole of the first todo item.
- **Nothing unfurls anything.** No `link` payload type is registered — `packages/core`'s
  `payload.ts` carries the generic shapes only, and CONTEXT.md's `link` entry is spec-only.
  Enrichment is stub: `pool.ts` wires `statusOf`, `request`, `artifactsFor` and `correct` to
  `notImplemented`, and shell.md lists an enrichment surface as out of scope precisely because
  suggestions and artifacts are not on the wire. `docs/standards.md` mentions Open Graph as
  something a `link` payload would one day want, and nothing implements it.
- **The daemon already makes outbound requests**, in `destination-webdav` and
  `destination-arena` — but only to an **account** a person configured. A URL a caller hands it
  would be the first egress the caller chooses.
- **A pool holds no settings** — which is why the opt-out became a plan of its own. `Pool` is
  fifteen entity-shaped APIs plus `identity()`, `MirrorSubject` is `item | destination | template`,
  and `ACTION_KINDS` has no entry that is not about one of those. There is no table, no port
  method, no wire route and no word in CONTEXT.md for a value that is true of the pool and that a
  person changes. [a-pool-holds-settings](a-pool-holds-settings.md) builds it.

---

## Decisions taken

Everything here is settled. What was proposed on 2026-09-23 and what the developer answered on
2026-09-24 are folded together; the questions themselves are kept at the bottom with their answers,
which is the convention the specs use.

- **A preview is fetched by the daemon and is not enrichment.** `GET /v1/unfurl?url=` reads the
  page, extracts its metadata and answers it. It is not a job, not a lease, not an artifact, not a
  suggestion, and it is not written anywhere. Building the enrichment machinery to get a thumbnail
  is a large lift for a reading nicety, and the shell's own spec says that surface is out of scope
  while nothing is on the wire.
- **Why the daemon and not the browser.** Two reasons, and the second is the one that matters
  here: most targets send no CORS headers, so the browser cannot read them at all; and a browser
  fetch tells Instagram, are.na and everyone else the reading device's address, which cuts against
  local-first and self-hosted being the point of this project.
- **A preview is indicative, like a destination's.** ADR 33 settled that an output asked for before
  anything commits is indicative and never binding. What is at a URL is the same kind of claim:
  best-effort, possibly stale, never a fact the pool commits to. That is the argument for holding
  it in memory with a lifetime rather than in the pool, and for answering "nothing could be read"
  as an ordinary answer rather than a refusal — the process surface already draws `no preview for
  this destination` and `out of reach` without the alarm.
- **The word is `unfurl`** — the verb for the request and the noun for what comes back. CONTEXT.md
  spends `preview` on a destination's output before commit, and a glossary using one word for two
  things is the failure this project's rules exist to prevent. The entry goes under *Reaching out*
  beside **Relay**, since like a relay it points at somebody else's server. The route, the client
  read, the component and the setting all take this name.
- **An ADR is warranted**, and is phase 2. The decision says no to a shape the docs already
  describe, for reasons that are not readable off the code, and it opens an egress path the project
  has not had. Without it the next reader finds an endpoint that looks like enrichment done wrong.
- **Open Graph only.** `og:title`, `og:description`, `og:image`, `og:site_name`, falling back to
  the document's own `<title>`. **oEmbed is not built** — it would buy real embeds from the sites
  people most want them from, at the price of a discovery step or a provider list and a second
  failure mode, and it is left for when something demands it. Nothing in the answer shape should
  make adding it a breaking change.
- **The guard is maximally strict, with no exception and no escape hatch.** Scheme `http` or
  `https` and nothing else; every resolved address refused where it is loopback, private,
  link-local, unique-local, multicast, reserved or unspecified, checked for an IP-literal host as
  well as for a resolved name; a bounded number of redirects, each hop resolved and checked again;
  a wall-clock timeout; a cap on bytes read, the head being all that is wanted. **There is no
  deployment-level allowlist.** The self-hosted wiki on the same network does not get an unfurl —
  no preview is preferred to any path by which an internal address gets fetched.
- **The fetch pins the address the guard checked.** A guard that resolves a name and then hands the
  name to `fetch` resolves twice, and a DNS answer that changes between the two walks through it.
  So the connection is made to the checked address, with the original hostname kept for `Host` and
  for TLS SNI, which means a dispatcher of its own rather than a bare `fetch`, and redirects
  followed by hand rather than by the runtime. This is a requirement of phase 4, not a caveat in
  `security.md`.
- **Unfurling is opt-outable, and the opt-out is pool state** — one value, mirrored, read back by a
  rebuild, changed in Settings, and true for every device reading the pool at once. Deliberately
  **not** a `localStorage` boolean like the palette or the order control: those are reading
  preferences with no privacy cost, and a privacy-consequential switch wants one source of truth
  rather than one that silently differs by which device happened to be logged in. The mechanism
  that carries it is [a-pool-holds-settings](a-pool-holds-settings.md); this plan declares the one
  value and consumes it.
- **Off means no request is made.** The client does not ask and then discard the answer; it does
  not ask. Suppressing the drawing would still have told the third party that somebody is reading,
  which is the whole of what the setting is for. **And the daemon refuses the route while it is
  off**, so a client that has not been updated, a script, or a stale tab cannot leak either. Two
  checks for one rule, because only the second is a boundary.
- **A client that has not yet read the value draws nothing and asks nothing.** Failing closed is
  settled in the prerequisite plan; what it costs here is that a cold client — a first run, or one
  whose cache was dropped because the pool identity changed — draws no previews until the pool has
  answered once. A client that has read it once goes on honouring what it last read, offline
  included, so this is not "offline means no previews".
- **Drawing is automatic, everywhere a link appears**, while the setting is on — the register rows
  on the queue and the feed, the item surface, and the process surface. Not gated to one surface.
  **What this costs, stated plainly**: a note holding five distinct links is five outbound requests
  the first time it is drawn, and a page of such rows is that many again. The hour-long cache is
  what makes every later read of the same link free; it does nothing for the first read of a page
  of links. This cost is named in `shell.md`'s `Shipped:` line as well as here, so nobody
  rediscovers it as a surprise.
- **The browser fetches the `og:image` bytes.** The daemon does not proxy them. It matches the
  precedent shell.md already states — an image in a capture "is drawn from wherever it points,
  which is what a person wrote" — and proxying would mean a second route, a second cache and
  blob-shaped questions for a thumbnail.
- **The cache is one hour, five hundred entries, and failures are cached for minutes.** A target
  that is transiently down should not be unreachable for an hour, and a target that is down should
  not be re-fetched on every draw. In memory, lost on restart, invisible to the mirror, and named
  by nothing in the pool.
- **The unfurl read lives in `@notemap/client`**, in the api layer, explicitly outside the cache
  and the outbox. The client is what holds the base URL, the transport and the credential, and the
  shell's rule is that it reads what it draws through the client. Nothing about an unfurl is
  cached, replayed or hydrated.
- **This is not the `link` payload type.** What is being drawn is a URL inside a `note`'s prose.
  Registering a `link` payload type is a separate decision with its own schema, its own adapter
  question and its own place in `standards.md`, and nothing here reaches for it.

---

## The opt-out is somebody else's plan

The pool-wide switch grew after this plan was written, and following it honestly reached a new API
on `Pool`, a store port method pair and a migration, a fourth mirror record kind, a rebuild that
reads it back, an `ACTION_KINDS` entry, two `/v1` routes, a client that holds it, a Settings
section and a word in CONTEXT.md — more work than the unfurl endpoint it gates, with its own
ADR-sized decision inside it and a naming question of its own.

So it is split out. [a-pool-holds-settings](a-pool-holds-settings.md) builds the concept; **it must
be `Done` before phase 3 of this plan starts.** What this plan owes it is small and is phase 3's
whole content: declare `unfurl` as one of its values, default on, and consume it in the route, the
client and the shell.

Three of its decisions reach back into this one:

- **The concept is a pool setting** *(settled 2026-09-24)*, and the derived names are settled with
  it — `pool.settings` on core, `GET`/`PATCH /v1/settings`, `client.settings`, and a **Pool
  settings** section in the shell. This plan writes `unfurl` as one pool setting and says so in
  those words.
- **The client fails closed** — a client that has not yet read the value from the pool asks nothing
  and draws nothing. It is cached and persisted like any pool state, so this bites on a cold client
  rather than on an offline one.
- **Core exports the declared list and the host hands it back**, on ADR 43's pattern. So declaring
  `unfurl` is an entry in `POOL_SETTINGS` and nothing more — no route, no table, no migration
  belongs to this plan.

---

## Tasks

### Phase 1 — a bare URL is a link

Depends on nothing. Independently shippable; do not hold it for the rest.

- [x] Branch `agent/clickable-links-and-link-previews`.
- [x] `apps/ui`: add `micromark-extension-gfm-autolink-literal`. One extension, not
      `micromark-extension-gfm` — the renderer is CommonMark by decision (shell.md, *Content*,
      2026-09-14), and tables, strikethrough and task lists are not what the todo asked for.
- [x] `markdown.ts`: pass the extension's syntax and HTML halves to the single `micromark` call.
      The `followable()` pass over `a[href]` is unchanged and is what still keeps the output safe —
      it runs after, over whatever the extension produced.
- [x] `markdown.test.ts`: `https://example.com` in prose is an `a[href]`; `www.example.com` is one
      too and is given a scheme; a URL inside a code span and one inside a fenced block are not
      linked; trailing punctuation stays outside the link; an existing `[text](url)` is unchanged;
      an autolinked address that `followable()` rejects comes out as text with no `href`.
- [x] `docs/specs/shell.md`, *Content*: a dated line saying a bare URL typed in prose is a link,
      by the GFM autolink-literal extension over the CommonMark core, held to the same
      `http`/`https` rule every other link is. Say the renderer is still CommonMark plus this one
      extension, so the next person does not read it as GFM.
- [x] Verify: `pnpm --filter ui test -- markdown` green; `pnpm -r --silent test`, `pnpm -r typecheck`
      and lint green. By hand: capture a note holding a bare URL, see it followable in the queue,
      the feed and the item surface.
- [x] Commit `feat(ui): render a bare URL as a link`.

### Phase 2 — the decisions are written down

Depends on phase 1 only for the branch.

Before any of the rest, because the shape these record is what phases 3 to 6 build, and writing
them afterwards would be retrofitting a doc to code.

- [x] `docs/adr/0051-an-unfurl-is-the-daemons-and-is-not-enrichment.md` *(named for the word, not "link preview", which the glossary spends elsewhere)*. What was weighed:
      enrichment with jobs and artifacts, a browser-side fetch, and the daemon endpoint. Why the
      first is the wrong size for a reading nicety and is out of scope for the shell anyway, why
      the second cannot read most targets and leaks the reader's address, and what the third costs
      — an egress path the caller chooses, and a cache that is not pool state. It also records the
      three narrower calls that belong with it: Open Graph only with oEmbed deliberately not built,
      a guard with no allowlist and a pinned address, and the browser fetching the picture on the
      precedent a capture's own image already sets.
- [x] `CONTEXT.md`: **Unfurl**, under *Reaching out*. What it is, that what comes back is
      indicative and held in memory, that it is never pool state and never mirrored, and that it is
      not a **preview**, which is a destination's. _Avoid_: preview (for this), enrichment,
      metadata, embed, oEmbed, scrape.
- [x] Verify: the ADR reads as a decision with its rejected options; no other doc says something it
      contradicts; the new glossary entry collides with nothing already there — including whatever
      **pool setting**, which [a-pool-holds-settings](a-pool-holds-settings.md) adds under *The
      store*. `unfurl` goes under *Reaching out*; the two do not meet.
- [x] Commit `docs(adr): a link preview is the daemon's and is not enrichment`.

### Phase 3 — the `unfurl` pool setting

Depends on phase 2, and on **[a-pool-holds-settings](a-pool-holds-settings.md) being `Done`**. That
plan builds the concept — core, the store, the mirror, the rebuild, the action log,
`GET`/`PATCH /v1/settings`, `client.settings` and the **Pool settings** section. None of it is
rebuilt here. If it is not done, this phase does not start; phases 1 and 2 are unaffected and can
ship meanwhile.

What this plan owes it is one entry in a constant.

- [x] Check the prerequisite is `Done` and its spec `Shipped:` entries are in place.
- [x] Add `unfurl` to `POOL_SETTINGS`: a boolean, **default on**. On is what the shell does before
      anybody says otherwise, and the safer default was weighed — a feature nobody can see until
      they find a switch is a feature nobody finds. The ADR from phase 2 says so.
- [x] Nothing else. The table, the routes, the action, the mirror record, `client.settings` and the
      **Pool settings** section all exist already, and the host already hands the list back.
- [x] Verify: `pnpm -r --silent test` green; by hand, the pool setting appears under **Pool
      settings** and in `GET /v1/settings`, and flipping it in one browser is agreed with by
      another.
- [x] Commit `feat(core): the unfurl pool setting`. *Nothing to commit: `unfurl` landed in
      `POOL_SETTINGS` with the prerequisite plan (#75).*

### Phase 4 — the daemon unfurls

Depends on phase 3, whose pool setting the route consults. Nothing in the shell calls this route until
phase 6; until then it is reachable only by a signed-in caller who curls it deliberately.

- [x] `apps/daemon/src/unfurl/`: the fetch, the guard, the extraction and the cache, as small files
      beside each other. Daemon-only — it is not core's, it is not a port, and no adapter seam has
      asked for it.
- [x] The **guard**, with its own file and its own tests. Every rule from *Decisions taken*, as
      named limits rather than inline numbers: the two allowed schemes; the refused address
      families, checked against an IP-literal host and against every address a name resolves to;
      the redirect cap, with each hop resolved and checked again; the wall-clock timeout; the byte
      cap. **No allowlist, no configuration, no way to switch it off.**
- [x] The **pinned fetch**, which is why the fetch is a seam of its own: the connection goes to the
      address the guard checked, the original hostname is kept for `Host` and for TLS SNI, and
      redirects are read and followed by hand rather than by the runtime — so no hop is fetched by
      a name that was resolved twice. The seam is also what makes the tests injectable without a
      global stub.
- [x] The **extraction**: `og:title`, `og:description`, `og:image`, `og:site_name`, falling back to
      the document's `<title>`. An answer with none of them is an answer, not a failure.
      `og:image` comes back as the absolute URL the browser will fetch.
- [x] The **cache**: one in-memory map, an hour per entry, five hundred entries, and a short
      lifetime of its own for an answer that failed. Lost on restart, invisible to the mirror, and
      nothing in the pool refers to it.
- [x] `routes/definitions.ts`, `routes/unfurl.ts`, and the registration in `app.ts` — behind the
      existing gate, so it is **not** in `OPEN_PATHS`. A signed-in caller only, and **refused
      while the pool setting is off**, which is the boundary the client's not-asking is not.
- [x] The answer shape: what was read, or an ordinary answer saying nothing was. A refusal is for a
      request that is wrong — a missing or unparseable `url`, an address the guard refuses, the
      setting being off — and each wants an entry in the refusal table with the status the
      document's own stated rule gives it. A target that timed out or answered nothing usable is
      not a refusal.
- [x] `routes/unfurl.test.ts`: a page with all four properties; one with none, falling back to
      `<title>`; one with neither; a redirect chain inside the cap and one past it; a redirect that
      lands on a refused address; a target that times out; every refused address family, by literal
      and by resolved name; a name that resolves to one address for the check and another for the
      fetch, which the pinning must defeat; an oversized body cut short; a second call inside the
      hour served without a second fetch and one after it fetching again; a failure served from the
      short-lived cache and re-fetched after it; the route refused while the setting is off.
- [x] `docs/specs/http-v1.md`: the route, its parameter, its answer, the new refusal codes, and a
      *Settled* line dated the day it lands.
- [x] `docs/specs/security.md`: a section for the one egress path a caller chooses — what the guard
      checks, that the address is pinned so the check is the address that is fetched, that there is
      no allowlist by decision, and that the route is behind the door and behind a pool setting.
      What it still does not close belongs here too, stated rather than claimed away.
- [x] Verify: `pnpm --filter daemon test` green; `pnpm -r typecheck` and lint green; OpenAPI
      regenerated and `openapi.test.ts` green. By hand: `curl` the route for a public page, for
      `http://127.0.0.1:4747/`, for a name resolving to `127.0.0.1`, and for a link-local address,
      and see the last three refused. *(2026-09-24: run against the real resolver and fetch rather
      than through `curl` — are.na, GitHub and Wikipedia answered in full; `127.0.0.1:4747`,
      `localhost` and `169.254.169.254` refused; Instagram answered its login wall's title,
      `Instagram`, and nothing else.)*
- [x] Commit `feat(daemon): unfurl an external link`.

### Phase 5 — the wire reaches the shell

Depends on phase 4.

- [ ] Regenerate `apps/daemon/openapi.json` and the client's generated types
      (`pnpm --filter @notemap/client codegen`).
- [ ] `@notemap/client`: one read in the api layer, **outside the cache, the outbox and hydration**.
      It asks nothing while the pool setting reads off, including while the client has never heard
      the setting — the fail-closed rule from phase 3, enforced here rather than left to the shell.
- [ ] Tests: it reaches the right path; a refusal comes back in the client's own refusal shape; it
      makes no request at all while the setting is off or unknown.
- [ ] Verify: `pnpm --filter @notemap/client test` green; `pnpm -r typecheck` green.
- [ ] Commit `feat(client): read an unfurl`.

### Phase 6 — the shell draws it

Depends on phase 5. **Must not land before phase 3**, which is what makes the drawing refusable.

- [ ] One component, drawn wherever a note's rendered links appear: the register row's body on the
      queue and the feed, the item surface, and the process surface. In the one face at the one
      size, from token roles only, with no second visual language. A block that has not answered,
      one that answered nothing and one that could not be reached are ordinary states and not the
      alarm.
- [ ] **Nothing shifts when an unfurl arrives**: the space it will occupy is reserved, the way the
      selected row's foot is already reserved on every row (shell.md, *The row*). A list that
      resettles under a reader as previews land is worse than no previews.
- [ ] The requests are made per distinct URL and de-duplicated within a draw, so a note naming the
      same link twice asks once and a page naming one link across five rows asks once. **A page of
      rows holding several distinct links is still several requests on its first read**, which is
      the cost the developer accepted; the hour-long cache is what makes every later read free.
- [ ] Nothing is asked while the setting is off. The shell does not draw a placeholder saying a
      preview was withheld either — the setting is in Settings, and a row explaining itself on
      every link would be the noise the offline marks were already trimmed of.
- [ ] Component tests: a link with an unfurl; one without; one still in flight; one refused; a note
      holding several; the same link twice asking once; and the setting off, asking nothing.
- [ ] `docs/specs/shell.md`, *Content* plus *The row* and *The process surface*: what draws, that
      it is automatic everywhere a link appears, what the three empty states say, that the picture
      is fetched by the browser from wherever it points, and that what governs it is a **pool
      setting** rather than a reading preference — the distinction the **Pool settings** section
      exists to make readable. Acceptance criteria for the no-layout-shift rule and for asking
      nothing while it is off. The `Shipped:` line names the cost plainly: several links on a page
      are several outbound requests the first time it is read.
- [ ] Verify: `pnpm --filter ui test` green; `pnpm -r --silent test`, `pnpm -r typecheck` and lint
      green; `pnpm test:stack` green. By hand: a note holding an are.na link, an Instagram link and
      a bare image URL, drawn on all four surfaces; then the setting off, and the network tab
      showing no request to `/v1/unfurl`.
- [ ] Commit `feat(ui): draw what an external link points at`.

---

## Open questions

All answered 2026-09-24, in conversation. Kept with their answers rather than deleted, which is
what the specs do.

- [x] 2026-09-23 — **Is an ADR warranted?** Answered: yes, and it is phase 2. Without it the next
      reader finds an endpoint that looks like enrichment done wrong.
- [x] 2026-09-23 — **`unfurl`, or another word?** Answered: `unfurl`, as proposed. The route, the
      client read, the component, the setting and the CONTEXT.md entry all take it.
- [x] 2026-09-23 — **Which metadata, from where?** Answered: Open Graph only — `og:title`,
      `og:description`, `og:image`, `og:site_name` — with the document's `<title>` as the fallback.
      oEmbed is explicitly not built.
- [x] 2026-09-23 — **Where does it draw, and is it automatic?** Answered: automatic, everywhere a
      link appears, not gated to the process surface. The several-requests-per-page cost was stated
      at the time and accepted; it is named in the task list and in `shell.md`'s `Shipped:` line so
      it is not rediscovered as a surprise.
- [x] 2026-09-23 — **Does the browser fetch the picture, or does the daemon?** Answered: the
      browser, on the precedent shell.md already sets for an image in a capture. No proxy route.
- [x] 2026-09-23 — **Does the read belong in `@notemap/client`?** Answered: yes, in the api layer,
      outside the cache and the outbox.
- [x] 2026-09-23 — **The lifetime, and the cap.** Answered: an hour, five hundred entries, and a
      failure cached for a few minutes rather than the full hour — so a target that is transiently
      down recovers quickly and one that is down is not re-fetched on every draw.
- [x] 2026-09-23 — **How far the guard goes.** Answered, in the strict direction and with no
      exception: no allowlist, not for a private address and not for a self-hosted wiki on the same
      network — no unfurl is preferred to any path by which an internal address gets fetched. And
      the fetch pins the address the guard checked, so the "unless the fetch pins the address"
      hedge this plan used to carry is a requirement instead.
- [x] 2026-09-24 — **Is the opt-out the device's or the pool's?** Answered: the pool's — one
      **pool setting**, mirrored, changed in Settings, true for every device at once. Not a
      `localStorage` boolean like the palette or the order control, which carry no privacy cost.
      Off means no request is made at all, and the daemon refuses the route besides.
- [x] 2026-09-24 — **Where does the pool-wide setting get built?** Answered: not here. It needed a
      concept notemap does not have, and that concept is
      [a-pool-holds-settings](a-pool-holds-settings.md), which must be `Done` before phase 3. Its
      own two questions — what the concept is called, and who owns the declared list — were both
      answered the same day, so nothing about it is open either.

**Nothing in this plan is open.** Phase 1 in particular depends on none of the above and can start
whenever.

---

## Unknowns

- **What `micromark-extension-gfm-autolink-literal` does to an address `followable()` rejects.**
  GFM autolinks `mailto:` and `xmpp:` forms as well as `http`. `followable()` drops the `href` and
  leaves the text, so an email address in prose would come out as unlinked text that is also no
  longer plain — worth a test either way, and worth deciding whether `mailto:` should be allowed
  through as a third protocol. Fallback if it reads badly: the extension has options, and the
  email half can be turned off.
- **Whether the extension's bundled size is worth noting.** It is small, but the shell's bundle is
  already a todo item of its own. Measure after phase 1; if it is noticeable, say so in the commit
  rather than discovering it later.
- **Whether any target worth previewing answers a plain fetch at all.** Instagram in particular
  serves a login wall to an unknown client and may answer nothing useful whatever the endpoint
  does, and Open Graph without oEmbed is exactly the case where that shows. Worth trying three real
  URLs by hand before phase 4 is built, because the answer changes how much of this is worth the
  egress surface. If the answer is "almost nothing useful", that is an argument to revisit oEmbed
  rather than to widen the guard.
- **What pinning the address costs in this runtime.** Connecting to a checked address while keeping
  the hostname for `Host` and TLS SNI is a dispatcher-level concern, and how cleanly it is done
  decides whether the fetch seam is a few lines or a file. Worth a spike before phase 4 is
  scheduled, since the whole guard depends on it and the strict decision leaves no fallback that
  skips it.
*(The unknowns the opt-out carried — the mirror's fourth record kind, verify and repair, the
client's persisted shape — moved with it to
[a-pool-holds-settings](a-pool-holds-settings.md).)*

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The guard in phase 4 is the part where a missing test is a hole rather than an oversight: every
refused address family gets a case, so does every redirect that reaches one, and so does the
resolve-twice case the pinning exists to defeat — a name answering one address to the check and
another to the fetch. A guard nothing tests that way is a guard that reads correct and is not.

The other one to write deliberately is *asking nothing while the setting is off*, in the client and
in the shell. It is an assertion about a request that must not happen, which nothing notices the
absence of unless something asserts it.

`pnpm test:stack` belongs to phase 6, which is the first point at which every layer of *this* plan
has moved. The prerequisite plan runs its own.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
