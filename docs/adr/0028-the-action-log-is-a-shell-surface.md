# 28. The action log is a surface of the shell, not a page the daemon serves

**Date**: 2026-09-02
**Status**: Accepted
**Deciders**: palmdrop

---

## Context and problem statement

On 2026-08-11 the action log was given a reader: `apps/daemon/public/log.html`, a hand-written page
the daemon served itself, on the same host-surface terms as the vendored Swagger UI at `/docs`.
It existed so that the log could be looked at without a database client, which is the difference
between a trace that is kept and one that is read. It was a good decision: `@notemap/ui` was a
sketch at the time, and a file the daemon already had a directory for cost nothing to add.

On 2026-08-25 it was redrawn — out of rounded cards and a system sans, into the same two columns
as the queue and the feed, with the shell's bar on top. That decision recorded a constraint that
came with it: the page **loads nothing from anywhere but the daemon**, so it cannot reach the
app's compiled stylesheet and restates every colour role inline. Two copies of a palette drift the
moment one moves, so `apps/daemon/src/log/log.test.ts` held the copy to
`apps/ui/src/styles/tokens.css`.

Drawing it again on 2026-09-02 is what raised the question. Two defects turned up in the page that
the shell does not have and cannot have: `.when { display: block }` does not stack a stamp whose
children are both inline, and a 6.5rem rail is narrower than the ten monospace characters of
`2026-09-02`, so a date wraps mid-way and reads as a different day. Both are fixable. Both are
fixable *twice* — once in a page that hand-rolls its DOM in a `<script type="module">`, and again
in whatever draws the same register in the app. That is the cost the copy was always going to
charge, arriving.

So: does the log stay the daemon's markup, or become a route of the shell?

---

## Decision drivers

- **`GET /v1/actions` is the promise, and `/log` never was.** [http-v1.md](../specs/http-v1.md)
  already said the page was "host surface on the same terms as the playground: absent from the
  document, referred to by nothing in `/v1`, and removable without changing a promise this spec
  makes." The permission to do this was written down before anybody wanted it.
- **One visual system, held by construction rather than by a test.** A test that compares two
  copies of a palette catches drift; it does not catch a breakpoint, a measure, a primitive or a
  stacking rule, and there is no test that would.
- **A shell surface reads through `@notemap/client`.** The page hand-rolled `fetch("/v1/actions")`
  and built its own URLs, which is the one thing a surface may not do.
- **The daemon should hold less, not more.** It is a thin translation onto core
  ([ADR 2](0002-core-is-a-host-agnostic-library.md)); a page with a renderer in it is neither thin
  nor a translation.

---

## Considered options

- Keep `/log` as the daemon's markup and fix the two defects there.
- Move the log into the shell and delete the daemon's page.
- Keep both — the daemon's page for a checkout with no UI build, the shell's for everyone else.

---

## Decision outcome

**The log becomes a route of the shell, and the daemon's page is deleted.** `apps/ui/src/routes/log/`
draws it from the shell's own primitives, reading through an `ActionsApi` on `@notemap/client`.
`GET /log`, `apps/daemon/public/log.html` and `apps/daemon/src/log/` are gone; `serveUi` answers
`/log` with the app, because an unmatched extensionless path already falls through to it. **The
path a person types does not change**, and neither does `GET /v1/actions`.

**The log is not in the durable store.** It is read for diagnosis rather than drained, so the
client keeps no page for it and writes none of it to disk: persisting it would grow what every
client writes for no offline gain, and a pool out of reach answers nothing rather than a stale
page. What has been walked is held by the shell and dropped on sign-out, on the same terms as the
client's own cache.

### Consequences

- **A daemon with no `public/ui` build loses `/log` entirely**, where before it had it. That is a
  checkout rather than a deployment — the `Dockerfile` copies `apps/daemon/public` after
  `pnpm build`, and [running.md](../running.md) describes the app as a static build the daemon
  serves from its own origin — but it is a real loss and worth stating rather than pretending it is
  nothing. `apps/daemon/src/ui/serve.test.ts` therefore asserts the door-shut property as "not
  refused" rather than "answers 200": that suite runs against a checkout, and a test must not
  depend on a build step.
- The copied palette goes, and the test guarding it goes with it. The shell's `@theme` tokens, its
  `narrow` breakpoint and its primitives apply directly, so the two defects above are fixed once —
  and they are **not fixed in the old page**, which is being deleted rather than repaired.
- The daemon still serves `/docs`, which stays exactly as it was: it is a vendored Swagger UI, and
  restyling somebody else's application is not this project's job. The host-surface category is not
  abolished; one page left it.
- A bookmark keeps working. A script that scraped the page's markup does not — nothing in this
  repo does, and nothing ever promised it. `GET /v1/actions` is what a script should have been
  reading and still is.

---

## Pros and cons of the options

### Keeping the daemon's page and fixing the defects there

Cheapest today and the status quo, which is worth something. It also keeps `/log` working on a
checkout with no UI build, which is the one thing this decision genuinely gives up.

Against it: the two defects are the second and third symptoms of one cause, and there will be a
fourth. The copy is held to the palette by a test and to nothing else — not the breakpoint, not the
measures, not the primitives — so every change to the register is a change to be made twice, by
somebody who has to remember there are two. That is the kind of cost that is invisible until it is
paid repeatedly.

### Keeping both

It would lose nothing. It would also mean two readers of the same log, one of which is the one
nobody opens and therefore the one that rots — with a test holding half of it honest and nothing
holding the rest. A second copy kept as a fallback is a second copy.

### Moving it into the shell

The register is already there, drawn once, with the tokens and the breakpoint that go with it.
`detail` is flattened generically — dotted keys, strings unquoted, arrays joined, nested objects
flattened — rather than rendered per kind, so a kind nobody has written yet reads correctly for
free, which is the property the old page's `JSON.stringify` had and lost the readability of.

It reverses a decision that was correct when it was made. The circumstances changed: the shell
that did not exist in August is where the register lives now, and a page that had no better home
has one.
