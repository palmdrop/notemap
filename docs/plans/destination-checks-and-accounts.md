# Destinations that say whether they are actually configured

**Date**: 2026-09-02
**Status**: Todo
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**:

---

## Goal

The settings screen answers, without anyone pressing anything, three questions it currently makes a
person guess at: which accounts a webdav destination may name, whether the daemon is answering, and
whether a destination is actually reachable rather than merely describable.

Concretely, when this is done:

- Adding a webdav destination offers the accounts declared in `config.toml` as a list to choose
  from, rather than a text field and a trip to a text editor.
- The daemon row is green because the client's own probe answered eight seconds ago, and says so.
  The button re-asks; it is no longer the only thing that ever asks.
- Every destination on the page describes itself on arrival, and each says whether it was really
  reached — the account resolved, the server answered, the credentials were accepted, the folder is
  there — rather than only whether an adapter is registered for its kind.

The developer's own words for it: the settings checks should happen on their own, a destination
check reports only whether an adapter is reachable rather than the destination itself, and there is
no way to tell whether one is correctly configured before routing to it. It also closes the half of
"destinations are configured in both `config.toml` and the UI" that can be closed without reopening
[ADR 28](../adr/0028-a-remote-destination-names-a-credential-profile-not-a-url.md): accounts stay
the operator's, in config, but the UI stops pretending it cannot see them.

Not in this plan: browsing a settings field the way a capability's arguments are browsed
([ADR 26](../adr/0026-a-destination-can-be-asked-what-an-argument-could-hold.md)), probing anywhere
but the settings screen, and any probe that writes.

---

## Tasks

### Phase 1 — an account is chosen, not typed

Depends on nothing.

- [x] Create branch `agent/destination-checks-and-accounts`
- [x] `WebdavDestinationConfig` takes the names of the accounts declared for its kind, beside the
      resolver it already closes over. Names only: no base URL and no secret reaches the adapter,
      so ADR 28's property — nothing secret in core, in the pool, or in anything `/v1` answers with
      — holds unchanged
- [x] `WEBDAV_SETTINGS` becomes a function of those names, publishing them as `examples` on the
      `account` property. **Not `enum`**: `usability()` re-validates a destination's settings
      against its kind's schema on every `describe()`, so a constraining schema would turn a
      destination into `unusable` the moment an account is renamed in config — which is precisely
      the outcome ADR 28 decided against, and it would strand a destination a rebuild restored.
      `examples` is a JSON Schema annotation and constrains nothing
- [x] `apps/daemon/src/ports.ts` hands the webdav adapter the names of the accounts of its kind,
      from the list it already filters for `transportWarnings`
- [x] `fieldsOf` in `apps/ui/src/lib/schema-form.ts` carries a field's `examples`
- [x] `DestinationForm` draws a `<select>` for a field that has them, and the text input it draws
      today for one that does not — so a daemon with no accounts declared leaves the field typeable
      rather than trapping a person behind an empty list, and says where accounts are declared
- [x] A value the destination already holds that is **not** among the examples is carried as an
      option of its own, marked as no longer declared. Without this, opening the form on a
      destination whose account was renamed silently rewrites the setting to whichever name sorts
      first
- [x] Tests: the form offers the declared accounts and nothing else; a stale account survives being
      edited; a kind with no examples still gets a text input
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`
- [x] `git commit`

**Settled 2026-09-02**: ajv's strict mode takes `examples` without being told about it — it is a
standard annotation of the dialect, unlike `x-notemap-candidates` — so the fallback keyword was not
needed.

### Phase 2 — the daemon row reads the reachability the client already holds

Depends on nothing.

- [ ] `reachability()` publishes when it was last answered, not only whether: `at` on every settle,
      and a measured `ms` only where the explicit probe measured one. Ordinary requests feed
      `settle()` through the `watching()` wrapper and carry no timing, which is the honest reason
      the latency is sometimes absent and the timestamp never is
- [ ] `Client.reachable` widens to that shape, and `client.probe()` exposes `reach.ask()` so a
      button can re-ask without inventing a second notion of reachability
- [ ] `apps/ui/src/lib/reachable.svelte.ts` reads the wider mark and exposes when it was answered
- [ ] `$lib/stamp` gains a relative reading — `timeOf` is minute-granular and cannot say "10 seconds
      ago"
- [ ] `Daemon.svelte` drops its own `answer` state and the `destinations.load()` knock. The comment
      justifying that knock — that `/v1` has no route whose only job is to answer yes — is wrong:
      `/v1/health` is that route, and the client has been probing it every ten seconds all along,
      which is why the row said "unasked" while the chrome said reachable. The row is green from the
      client's mark, says when it was last answered, and ticks while it is mounted
- [ ] "Check again" stays, wired to `client.probe()`
- [ ] Tests: the row is green without anyone pressing anything; it names how long ago; the button
      re-asks
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`
- [ ] `git commit`

**Unknown**: what else subscribes to `client.reachable`. `reachable.svelte.ts` is the only reader
found, but the client's own tests assert on it. If widening proves noisy, the fallback is to keep
`reachable` a boolean and publish the answer time beside it — worse, because two observables of one
fact drift.

### Phase 3 — a destination describes itself without being asked

Depends on nothing. Touches the same component as phase 6.

- [ ] `Destinations.svelte` describes every destination it lists on mount and on return to reach,
      concurrently, each row holding its own state. The `described` record is already keyed by id;
      what is missing is that anything fills it
- [ ] A retired destination is not asked automatically — it is offered to nothing new — and keeps
      the manual control
- [ ] The row's states become four: asking, described, refused with the reason, and not asked, which
      is now only ever a retired one
- [ ] Both shipped kinds `describe()` without touching disk or network, by contract, so this costs
      nothing today. It is written per row rather than as one list-wide read because the first kind
      that goes and looks must leave one row saying "asking" instead of stalling the page
- [ ] Tests: the page describes what it lists; a destination that cannot describe itself shows the
      reason without the rest of the list waiting for it
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`
- [ ] `git commit`

### Phase 4 — decide what a probe answers, in the docs

Depends on nothing. Settle it before phase 5 writes anything against it. **Nothing lands here
without the developer's confirmation.**

- [ ] A new ADR: **a destination can be asked whether it is really there**. `probe` joins `describe`
      and `candidates` on `DestinationKindAdapter` and the `Destinations` port, optional on the
      adapter, with the registry turning an absent method into `not-offered` — exactly the shape
      ADR 26 settled for `candidates`, and for the same reason: "nothing here can be asked" is one
      fact to a caller however it was arrived at
- [ ] The answer is `ready`, `rejected`, `unreachable`, `unusable` or `not-offered`. The
      `rejected`/`unreachable` split is `DeliveryOutcome`'s, already in the domain, and it is the
      distinction a person needs: something you must go and fix, against something that is merely
      asleep and will be retried
- [ ] `describe()` is untouched and stays offline-safe. This is the third call, not a change to the
      first — the reasoning ADR 26 and ADR 28 both spend paragraphs on holds
- [ ] Amend ADR 28: an undeclared account or an unreadable secret answers a probe `rejected`, though
      it stays `unreachable` to a **delivery**. What that ADR protects is retry semantics — a
      pending delivery must come back — and a probe has none to protect
- [ ] `ready` means the account resolved, the destination answered, the credentials were accepted
      and the root is there. It does **not** mean writable: proving that means creating and deleting
      a file in somebody else's vault, which is not what a button labelled "check" should do.
      Settled 2026-09-02, one line in the spec, inferred rather than proven
- [ ] The routing section of `core.md` and the Destinations section of `http-v1.md` change in the
      same commit as the ADR, per the project's rule that docs and code agree
- [ ] Verify: the docs read back coherently, and the developer confirms the vocabulary before phase
      5 starts
- [ ] `git commit`

### Phase 5 — core and the two adapters

Depends on phase 4.

- [ ] `DestinationProbe` in the domain types, `probe` on the port and on the adapter interface, and
      the registry's absent-method case
- [ ] The pool's own `probe`, alongside `describe` in `pool/destinations/`, running the same
      usability check first so an unusable destination is never asked anything
- [ ] Filesystem: `stat` the root and check write access. Not there is `rejected`; the errno list
      the adapter already treats as unreachable stays `unreachable`; an overlap with the daemon's
      own paths is `unusable`, as `describe()` already answers it
- [ ] Webdav: resolve the account — undeclared or unreadable is `rejected`, naming which — then
      `PROPFIND` depth 0 on the root. Answered is `ready`; `401`/`403` is `rejected` naming the
      credentials; `404` is `rejected` naming the folder; a socket that never opened or a `5xx` is
      `unreachable`
- [ ] `Dav` gains the one method that asks whether a collection is there. It has `get`, `create`,
      `replace` and `makeCollection` and nothing that only looks
- [ ] Tests beside each: every branch of both adapters, and the registry's `not-offered`
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`
- [ ] `git commit`

**Unknown**: whether the servers worth caring about accept a `PROPFIND` with no body. The
specification allows it and reads it as `allprop`; some servers do not. Fallback is the minimal
`resourcetype` request body, which is what a broad server accepts either way — cheap enough that it
may simply be what gets written first.

### Phase 6 — the route, the client, and the row

Depends on phase 5.

- [ ] `GET /v1/destinations/{id}/probe`, beside `/description` and `/candidates`, and its entry in
      the daemon's own API definitions
- [ ] `DestinationsApi.probe`, on `describe`'s terms: asked now, cached by nothing
- [ ] `Destinations.svelte` probes what it describes, automatically, for every destination that is
      not retired. The row carries both answers: what it can do, and whether it is really there
- [ ] Only the settings screen probes automatically. The routing composer does not — it must never
      stall on a destination that is asleep, and a decision to route is worth making whether or not
      the delivery can happen yet
- [ ] Tests: the page probes what it lists; each answer draws distinctly; a `not-offered` kind says
      so rather than looking broken
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, and `pnpm test:stack` —
      this phase crosses the HTTP surface, the host's wiring and the client's transport, which is
      what that suite is for
- [ ] `git commit`

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The settings screen already has a harness — `apps/ui/src/components/settings/settings.test.ts`
serves a pool that answers every route the screen uses — and phases 1, 2, 3 and 6 all extend it
rather than building a second one. Phase 5's adapter tests belong beside each adapter, and the
webdav ones want the transport stubbed rather than a real server: the hand check against a live
Nextcloud is the developer's, as it was for
[destination-webdav](destination-webdav.md).

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed
and linking back to this plan. No implementation details, no granular tasks. A plan marked Done
whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
