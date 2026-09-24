# Review: Clickable links and link previews (unfurl)

**Date**: 2026-09-24
**Status**: Resolved
**Scope**: `git diff main` on `agent/clickable-links-and-link-previews` — `apps/daemon/src/unfurl/`, `apps/daemon/src/routes/unfurl.ts`, `apps/ui/src/components/unfurl/`, `apps/ui/src/lib/{markdown,unfurls,said}.ts`, `packages/client/src/unfurl/`, specs, ADR 51, CONTEXT.md
**Plan**: `docs/plans/clickable-links-and-link-previews.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/http-v1.md`, `docs/specs/security.md`, `docs/specs/client.md`

---

## Overall

Changes requested, for one bug. The implementation matches the plan and ADR 51 closely. The guard is sound: the URL parser normalises IPv4 literal forms, `::/8` covers mapped and compatible v6, NAT64/6to4/Teredo are refused, one bad address refuses the name, and the lookup is pinned for both the `all: true` and single-answer forms, so happy-eyeballs cannot re-resolve. Redirects are followed by hand and each hop is checked again. SNI and `Host` carry the name. The timeout covers the whole chain, and the byte cap is counted after decompression. The bug is in the extractor. A hostile page, within the byte cap, can block the daemon's event loop for about 17 seconds per unfurl. Neither the timeout nor the cap stops it, because extraction is synchronous and runs after the fetch. Every spec has its dated `Shipped:` entry. Typecheck, `pnpm -r --silent test` and lint are green.

---

## Bugs

### 1. Quadratic regexes in `extract` stall the daemon on a hostile page

`apps/daemon/src/unfurl/extract.ts:35` and `:45`. When a page has no `</head>`, `head` is the whole body, up to the 512 KB cap. Both regexes backtrack quadratically on input a page controls:

- `/<meta\b[^>]*>/gi` over `"<meta ".repeat(n)` with no `>`: each start scans to the end of the string.
- `/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i` over `"<title>".repeat(n)` with no closing tag: each start lazily scans to the end.

Measured under Node on 512 KB inputs: `<title>` took about 4.9 s and `<meta` about 12.5 s. A gzip body shrinks this to a few kilobytes on the wire.

```
note or relayed capture links to hostile page → shell draws row → GET /v1/unfurl
→ fetch finishes inside the 5 s deadline → extract() runs synchronously
→ event loop blocked ~17 s → every request to the daemon stalls
```

`UNFURL_TIMEOUT_MS` cannot interrupt this, and each distinct URL on the hostile host (for example a different query string) starts again. Relays capture other people's links without anyone looking, so a person does not have to paste the link themselves. `routes/unfurl.test.ts` and `extract.test.ts` only test well-formed pages.

Fix: make the scan linear. One way is to cut `head` at a small fixed length (Open Graph tags sit near the top) and scan tags with a single forward pass or `indexOf`, not regexes that restart at every candidate. Add a test with a pathological body and a time bound.

---

## Design

### 2. Every failure is drawn as `not read`, including an unreachable daemon

`apps/ui/src/components/unfurl/Unfurl.svelte:41-43`. Any rejection from `client.unfurl` becomes `UNFURL_NOT_READ`. That covers `Unreachable` (daemon offline or the network down) and `409 unfurl-off` (a stale cached setting). `said.ts` and shell.md define `not read` as "the daemon would not read it: an address inside a network". So a client that has gone offline, with the setting cached as on (shell.md and client.md both say it keeps honouring the setting offline), labels every link on every row `not read`. That is a false statement about the link. Separate `Refused` with `address-refused`/`bad-url` from the rest. For `Unreachable` and `unfurl-off`, either draw the plain asking state (host only) or draw nothing, and have the spec say which.

---

## Minor

### 3. `og:image` has no length cap

`apps/daemon/src/unfurl/extract.ts:53`. Title and description are capped, but the image URL is not, and it can be close to the whole 512 KB body. At 500 entries, the worst case for the cache is about 250 MB, and the same string goes to every shell that asks. Cap it the way the other fields are capped, or drop an oversized URL.

### 4. A first-hop refusal is a DNS oracle for internal names

`apps/daemon/src/unfurl/unfurl.ts:70-75`. A name that resolves to a private address answers `422 address-refused`. One that does not resolve answers `200 reached: false`. So a signed-in caller can learn which internal names exist, and whether they are private. This follows from the refusal/answer split in http-v1 and is probably acceptable, but security.md's "What it does not close" should list it.

### 5. Refusals are cached nowhere, so each draw asks again

`apps/ui/src/lib/unfurls.ts:25-28` forgets a rejected answer. The daemon does not cache refusals either (`unfurl.ts:134`, `result.ok` only). A note linking to an internal address therefore sends a request, and the daemon does a DNS lookup, every time the row is redrawn. That contradicts shell.md's "a link is asked about once per page". A failure that is not a refusal (offline) should probably still be forgotten.

### 6. The block is 2px shorter than its four lines

`apps/ui/src/components/unfurl/Unfurl.svelte:60`. The height is `4 × 22px + 16px`, but under the preflight's `border-box` the 1px border comes out of that height. The content box is 86px against 88px of text, so the second description line is clipped at its descenders. Add the border to the calc, or apply the height to an inner box.

### 7. An image response is read to the byte cap before answering

`apps/daemon/src/unfurl/fetch.ts:54`. Every 2xx body is read, but `unfurl.ts:95` needs only the headers for `image/*` (and for any other non-HTML type). The body can be skipped when the content type is not HTML.

### 8. Glossary drift: "link preview"

CONTEXT.md now lists "link preview" and "preview (for this)" under _Avoid_. This diff still adds `"unfurl-off": "showing link previews is turned off for this pool"` (`packages/client/src/errors.ts:174`), and shell.md adds "no placeholder says a preview was withheld". The label `show link previews` comes from the prerequisite plan. Either allow "link preview" as user-facing copy and say so in the entry, or reword these.

### 9. The HTTPS path of the pinned fetch is untested

`apps/daemon/src/unfurl/fetch.test.ts` tests only `http:`. There is no test that pinning keeps SNI and certificate verification against the name, which is the half of "pinned address, name kept" that matters most. A self-signed local TLS server with the name in its certificate would cover it.

---

## Non-issues

- **`409 unfurl-off`**: a pool setting is state the pool holds, and the client can reconcile by re-reading it, so it fits http-v1's rule for `409`.
- **`422 bad-url` for a query parameter**: consistent with `bad-order`, `bad-kind` and `limit-too-large`. `400` is kept for bodies.
- **A redirect to a refused address answers `200 reached: false`**: the target caused it, not the caller. Documented in http-v1.
- **Setting checked before the URL is validated**: while the setting is off, nothing about the request matters, and the route resolves nothing.
- **No `error` listener on `IncomingMessage`**: Node emits `error` on a client response only when a listener exists, so a response aborted mid-body cannot crash the daemon. An abort mid-body on the gzip path was checked by hand and rejects rather than hanging.
- **Pinned lookup answering `[address]` for `all: true`**: this is the happy-eyeballs path (`autoSelectFamily` is on by default), and the `unfurl.invalid` tests exercise it.
- **`agent: false`**: no pooled socket carries a connection across hops or names, and no environment proxy is picked up.
- **Two `BlockList`s**: needed, as the comment says. A v6 list holding `::/8` would match every IPv4 address.
- **No rate limit or concurrency cap**: a stated decision, listed under "Load" in security.md.
- **The browser fetching `og:image`**: decided in ADR 51, with the cost to the reader's privacy recorded there and in security.md.
- **The process surface draws plain text but unfurls rendered links**: the head was already plain text, and `links()` is the only place that decides which links are followable.

---

## Resolution

1. **Fixed.** The regex extractor is gone. `unfurl/head.ts` streams the body into `htmlparser2`
   and stops at `</head>`, at `<body>` or at the byte cap, so parsing is linear and usually reads
   a few KB. Comments and scripts are skipped, quoted `>` is handled, and every named entity is
   decoded. The charset comes from the header or else the page's own `<meta>`. The developer chose
   to add fallbacks at the same time: `twitter:` tags, `description`, `application-name` and
   `image_src`. ADR 51 carries a dated amendment. `head.test.ts` checks that four hostile pages
   each parse in under a second.
2. **Fixed.**
   - A refusal for the link (`address-refused`, `bad-url`) reads `not read`.
   - `unfurl-off` reads the pool settings again, so every block goes.
   - Anything else, the daemon being unreachable included, reads `out of reach` and is asked again
     on the next draw.
   - shell.md says which is which.
3. **Fixed.** An image address longer than 2048 characters is dropped.
4. **Documented, not closed.** The developer decided to keep the refusal. security.md lists what it
   reveals under "What it does not close".
5. **Fixed.** The daemon holds a refusal for as long as it holds a failure, and the shell keeps a
   refused link for the life of the page.
6. **Fixed.** The four-line height is on an inner box, so the border and padding add to it instead
   of coming out of it.
7. **Fixed.** A body is read only for an HTML success. Any other response is destroyed unread, and
   a route test asserts that nothing was pulled from it.
8. **Resolved by decision.** The developer chose the label `show link previews`, so the shell's
   words for a person say "link preview". CONTEXT.md now limits the _Avoid_ list to code and docs,
   shell.md says so, and shell.md's own "a preview was withheld" now reads "an unfurl".
9. **Fixed.** `createPinnedFetch({ ca })` and a checked-in self-signed certificate for
   `unfurl.test` (`apps/daemon/src/testing/tls/`). The tests show SNI carries the name, a
   certificate for another name pinned to the same address is refused, and an untrusted
   certificate is refused.

