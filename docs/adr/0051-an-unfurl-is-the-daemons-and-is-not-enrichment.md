# 51. An unfurl is the daemon's, read on demand, and is not enrichment

**Date**: 2026-09-24
**Status**: Accepted — builds on [ADR 33](0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md) and
[ADR 50](0050-pool-settings-are-pool-state.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A link in a note is drawn as a link and nothing more. A person reading the queue wants to see what
the link points at — a title, a picture, a line of description — without following it. Somebody has
to fetch the page at the other end and read its metadata, and the question is who, where the answer
is kept, and what may be fetched.

The docs already describe a shape that could hold it: enrichment, with jobs, leases, artifacts and
suggestions, a `link` payload type whose standards entry names Open Graph. None of it is built, and
the shell lists an enrichment surface as out of scope while nothing of it is on the wire.

Whatever fetches a URL a caller hands it is a new kind of egress. Until now the daemon reached out
only to an **account** a person configured.

## Decision drivers

- **Privacy and local-first.** Whoever fetches the page tells its server the fetcher's address.
- **Most targets cannot be read from a browser**, sending no CORS headers.
- **The size of the thing.** A thumbnail beside a link is a reading nicety, not pool state.
- **A caller-chosen URL must never reach an internal address**, however the name resolves.

## Considered options

1. **Enrichment**: an unfurl as a job, leased, its result an artifact or a suggestion on the item.
2. **A browser-side fetch**, from the shell, of the page itself.
3. **A daemon endpoint**, `GET /v1/unfurl?url=`, answering what it read, held in memory with a
   lifetime.

## Decision outcome

**Option 3.** The word is **unfurl**, for the request and for what comes back: **preview** is
already a destination's output before commit.

An unfurl is indicative in the sense ADR 33 gives an output asked for before commit — best-effort,
possibly stale, never a fact the pool commits to. So it is not written anywhere: an in-memory cache,
an hour an entry, five hundred entries, a failure kept for minutes rather than the hour. Lost on
restart, invisible to the mirror, named by nothing in the pool. "Nothing could be read" is an
ordinary answer, not a refusal; a refusal is for a request that is wrong.

Three narrower calls belong with it:

- **Open Graph only** — `og:title`, `og:description`, `og:image`, `og:site_name`, falling back to
  the document's `<title>`. oEmbed is not built: it buys real embeds from the sites people most want
  them from, at the price of a discovery step or a provider list and a second failure mode. The
  answer's shape leaves room to add it without breaking anything.
  *Amended 2026-09-24, the same day, after review:* Open Graph first, and where a page does not
  carry an Open Graph property, the tags that pages which never adopted it, or adopted only part
  of it, say instead — `twitter:` tags, `<meta name="description">`, `application-name` and `<link rel="image_src">` — before the document's `<title>`. Still no oEmbed:
  every fallback is read from the same head of the same response, so none adds a request or a
  failure mode. The head is read by a streaming HTML parser, `htmlparser2`, and reading stops
  where the head ends: the first version's regular expressions could be made to take seconds by a
  page built for it.
- **A strict guard, with no allowlist, and a pinned address.** `http` and `https` only; every
  loopback, private, link-local, unique-local, multicast, reserved or unspecified address refused,
  for an IP-literal host and for every address a name resolves to; a bounded number of redirects,
  each hop checked again; a timeout; a cap on bytes read. There is no deployment-level exception: a
  self-hosted wiki on the same network gets no unfurl, since no unfurl is preferred to any path by
  which an internal address is fetched. The connection is made to the address the guard checked,
  with the hostname kept for `Host` and TLS SNI, and redirects are followed by hand — so a name
  answering one address to the check and another to the fetch does not walk through.
- **The browser fetches the picture.** The daemon answers `og:image` as an absolute URL and does not
  proxy the bytes, on the precedent an image in a capture already sets: it is drawn from wherever it
  points.

It is governed by the **pool setting** `unfurl`, default on. Off means no request is made: the
client does not ask, and the daemon refuses the route besides, so a stale tab or a script cannot
leak either. Default on was weighed against default off: a feature nobody sees until they find a
switch is a feature nobody finds.

Option 1 was rejected as the wrong size: jobs, leases and artifacts for a thumbnail, on a surface
the shell has declared out of scope, and a result written into the pool that is only ever
indicative.

Option 2 was rejected because it cannot read most targets at all, and because it tells every
target the reading device's address — the opposite of what a self-hosted, local-first tool is for.

### Consequences

- **Good** — the reader's device never contacts the page's server for the metadata; only the
  daemon does, and only while the pool setting allows it.
- **Good** — nothing about an unfurl is pool state, so nothing about it needs mirroring, rebuilding
  or repair.
- **Bad** — an egress path whose target the caller chooses. The guard is the whole of the defence,
  and `security.md` states what it does not close.
- **Bad** — a page of rows holding several distinct links is several outbound requests the first
  time it is drawn. The cache makes every later read free, not the first.
- **Bad** — the picture is still fetched by the browser, so the image host does see the reader.
- **Neutral** — sites that serve a login wall to an unknown client, Instagram among them, may
  answer nothing useful. That is an argument for oEmbed later, never for widening the guard.

---

## Pros and cons of the options

### Enrichment

- **Good** — the shape the docs already describe; the result would survive a restart.
- **Bad** — the largest lift of the three, for a reading nicety.
- **Bad** — writes indicative, possibly stale metadata into the pool as though it were a fact.

### A browser-side fetch

- **Good** — no new server route and no egress from the daemon.
- **Bad** — most pages send no CORS headers and cannot be read.
- **Bad** — leaks the reader's address to every target.

### A daemon endpoint

- **Good** — reads anything a plain fetch can, from the daemon's address rather than the reader's.
- **Good** — small: a route, a guard, an extractor and a cache.
- **Bad** — the caller chooses where the daemon connects, which only the guard makes safe.

---

## More information

The wire: [http-v1.md](../specs/http-v1.md); the guard: [security.md](../specs/security.md); what
draws: [shell.md](../specs/shell.md).

Plan: [clickable-links-and-link-previews](../plans/clickable-links-and-link-previews.md).

Revisit if Open Graph alone answers too little from the sites that matter, which is the case for
oEmbed, or if the first-read cost of a page of links proves too high to draw automatically.
