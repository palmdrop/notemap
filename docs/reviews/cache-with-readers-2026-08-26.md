# Review: The cache is read, capped, and checked against the pool

**Date**: 2026-08-26
**Status**: Open
**Scope**: `packages/client/src/{client,types,errors}.ts`, `packages/client/src/{state,pool,surfaces,testing}/`, `apps/ui/src/lib/reachable.svelte.ts`, `docs/`
**Plan**: `docs/plans/durable-offline-client.md` (phases 3, 4, 6), `docs/plans/offline-capture-rollout.md` (PR 5)
**Spec**: `docs/specs/client.md`, `docs/specs/sync.md`
**ADR**: `docs/adr/0023-a-changed-pool-identity-drops-the-cache-and-keeps-the-outbox.md`
**PR**: [#27](https://github.com/palmdrop/notemap/pull/27)

---

## Overall

The store finally has a reader, and the three pieces are each in the right place. `fromCache` as a
property of the page rather than a flag someone sets is the good decision here — a page holding no
ids, no position and no exhaustion has never been answered for, and that is derivable rather than
remembered, so no path can forget to maintain it. Dropping `loaded()`'s obligation falls out of it
instead of being worked around. Retention applied at the one `writable` seam, rather than at each
site an item enters, is the same instinct and is right for the same reason.

Reachability in the client rather than on the port is the correct call and the recorded reasoning
holds up — see finding 5. Probing only while unreachable is also defensible; what it costs is
narrower than it looks but is not nothing, and is finding 6.

`pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint` and `pnpm test:stack` are green on
`6a0cdfc`.

Two findings I would stop for. Finding 1 is a behaviour regression on a healthy online client:
turning a surface around re-enters the cache-drawn state, so the list jumps to the whole cache and
back, and `fromCache` — which PR 7's mark will draw — flashes true with nothing wrong. Finding 2 is
that the history cap does not hold: the "an item a surface is drawing is never evicted" exemption
covers every id in `feed.ids`, and `feed.ids` is append-only, so a long feed session is exactly the
case the cap was written for and exactly the case it does not reach. Both reproduced.

---

## Bugs

### 1. Turning a surface around puts a pool-answered surface back on the cache

`packages/client/src/surfaces/reads.ts:77-81` mints `emptyPage(order)` on a turn, and
`packages/client/src/state/state.ts:127` reads any page with no ids, no `after` and no exhaustion as
cache-drawn. So between the turn and the pool's answer the surface reports `fromCache: true` and
draws the entire cache in the new order.

Reproduced on a queue holding one pool-answered row over a cache of forty, with the turn's read held
open:

```
after first pool read:  { fromCache: false, loading: false, count: 1 }
mid-turn:               { fromCache: true,  loading: true,  more: true, count: 41 }
```

Three things wrong with that:

- **It contradicts the spec.** `client.md`'s *Surfaces drawn from the cache* says "a surface the
  pool has **never** answered for"; this one has. It also says a cache-drawn surface "is not
  loading", and here `fromCache` and `loading` are both true. The same overlap exists on the very
  first read of a cold online client, where drawing the cache is intended — so the sentence is
  wrong even in the case the feature is about, and `ListState` now has two flags a shell has to
  reconcile with no rule for doing it.
- **It is visible.** A person who flips the order on a full cache watches twenty-five rows become
  five hundred and then twenty-five again.
- **It will be visible twice** once PR 7 draws the mark, which will say "showing what I hold" during
  an ordinary online interaction.

`fromCache` is doing two jobs: *this page holds no position* (structural, correct, what `intoPage`
and the replace-not-extend rule want) and *this surface is the client's own rather than the pool's*
(what the shell wants). They coincide before the first read and diverge on a turn. The cheapest
separation I see is to keep the derived predicate for the page's internals and gate the reported
flag on the surface never having been answered for — a `answered: boolean` on `ListPage` that
`extended` sets and `emptyPage(order)` on a turn carries over. Worth discussing rather than my
picking it.

### 2. The history cap does not bind while a surface is drawing

`packages/client/src/state/retention.ts:31-36` exempts every id in `state.feed.ids` and
`state.queue.ids`. `extended` appends to `page.ids` and nothing ever trims it, so paging the feed
past the cap makes every item past the cap exempt:

```
600 processed items, none paged        → retained() keeps 500
600 processed items, all in feed.ids   → retained() keeps 600
```

Feed history *is* what the feed page is drawing. So the rule the plan asked for — "items that are
only feed history are capped, oldest touched first" — is unenforced in exactly the session it was
written for, and the cache grows without bound for as long as the tab is open. It only ever fires
when a page is replaced or an item is forgotten, which is to say when the items had already left the
reader.

The intent behind the exemption is right and `client.md` states it ("would vanish under the
reader"). It is the scope that is wrong: what must not vanish is what is *on screen*, and `page.ids`
is everything ever scrolled past, not that. Options worth weighing — bound the exemption to the
tail of the page rather than all of it; trim `page.ids` when its items are evicted so the surface
and the cache shrink together; or raise the cap and accept the exemption as a soft one. As it stands
the cap is documented as a bound the code does not enforce, which by this project's rules is the
finding whichever way it is resolved.

### 3. The reachability backoff has no teardown

`packages/client/src/pool/reachability.ts:47-53` schedules with `setTimeout` and reschedules from
inside the callback; nothing returned by `reachability` stops it, and `Client` exposes no `close`.
A client that stays unreachable probes for the life of the process.

In a browser that is arguably fine — the client is a module singleton and dies with the page. In the
test suite it is not: `cache.test.ts` and `retention.test.ts` build unreachable clients on real
timers, and each leaves a chain that goes on pushing into `transport.sent` for the remainder of the
run. Nothing fails today, but two of those files assert on `sent` indices (finding 8) and the
combination is a flake waiting for a slow CI box.

`Client` acquiring a `close()` is a bigger decision than this PR — the persist and drain
subscriptions have never had one either — so the narrow fix is for `reachability` to return a way to
stop and for the tests that build unreachable clients to use it. Flagging the general gap: this is
the first thing the client owns that keeps *running* rather than merely holding a subscription.

---

## Design

### 4. `rebuilt` drops items that retention is careful never to evict

`state.ts`'s `rebuilt` clears `items` wholesale, including the items an undrained operation is
about — which `retained` protects by name because they are "work that has not landed". Both are
right on their own terms: retention protects them because the cache is the only copy of what the
operation is *about*, and the rebuild drops them because they describe a pool that is gone.

The consequence is small and mostly self-healing — the boot drain runs immediately after and a
replayed capture comes back from the new pool — but it is a real gap between ADR 23's "nothing the
person did is lost" and what a person sees, which is their offline captures leaving the queue and
returning a moment later. ADR 23's consequences list the *cache* loss and the refusal case; it does
not mention the working set blinking. One sentence in the ADR's consequences would close it.

### 5. Reachability in the client rather than on `Transport` — agreed

Recorded in `client.md`'s prior decisions and in the plan's amended bullet. The reasoning is sound
and I would have argued for the same shape: every request already funnels through the api layer,
which is the only place holding the `Unreachable`/`Refused` distinction, and `undecided()` is where
the 5xx rule lives. On the port it would be one implementation per adapter with the interesting
predicate duplicated into each.

One thing the recorded reasoning does not name, and should if this is ever revisited: the actual
argument for the port was never "a shell can compute it too", it was "a shell can answer it
*without a round trip*" — a native platform reachability signal costs nothing, where the probe costs
a request per backoff tick. That is the condition under which the revisit is worth making, and
"Revisit when a shell can genuinely answer it better than a probe can" is vague about it. A clause,
not a change of shape.

### 6. Probing only while unreachable — accepted, but the identity check is effectively boot-only

The reasoning in `client.md` is right about reachability itself: a client whose requests are being
answered has better evidence than a poll, and a permanent poll is a real cost for a local-first
client. The stale-true window — the daemon dies while nobody asks, and the shell's mark says yes
until the person does something — is acceptable, because the first thing they do corrects it.

What is not written down anywhere is the knock-on for ADR 23. The probe is the only thing that reads
`/v1/health`, so it is the only thing that reads the pool identity. If the probe runs only on start
and while unreachable, then **a rebuild is detected on start, or on returning from unreachability,
and at no other time**. In practice that covers it — a rebuild involves the daemon going away — but
a daemon restarted fast enough to answer every request the client made would leave the client
drawing a cache of the old pool for the rest of the session, which is the unfalsifiable case ADR 23
exists to remove. Either the ADR should say when detection happens, or it needs a cheaper trigger
(the drain already runs on return to reach; the identity could ride the next ordinary read).

### 7. `mockTransport` answers `/v1/health` ahead of the test handler

`testing/transport.ts:51-55` intercepts the route before `handler(request)`, so no test can make
health 500, refuse, or answer without `pool`. `unreachable(true)` is the only failure a test can
express.

I traced both paths and they are correct: `undecided()` throws `Unreachable` on 5xx, so
`askedHealth` returns false and `watching` has already reported `status < 500`; a 4xx becomes
`Refused`, which `askedHealth` counts as reach, matching the spec's "a 5xx is not evidence of reach"
by implication. So the interception is not hiding a bug I can find. It is hiding the *test*: the 5xx
rule is stated twice in prose (`client.md`, and the docblock on `watching`) and exercised nowhere on
the probe path. It is the kind of claim that quietly inverts under a later refactor. Letting the
handler answer `/v1/health` when it wants to, and falling back to the mock's identity when it does
not, would cost a line.

A second thing it hides: a health answer with no `pool` field makes `isThePoolWeCached` return
early, which is deliberate and untested.

---

## Tests

### 8. Two assertions now index raw `transport.sent`, where the probe can land

`asked()` exists precisely so this does not happen, and these two were missed:

- `client.test.ts:681` — `const sent = transport.sent[0]!` then asserts it is the `PUT /v1/assets/…`.
- `client.test.ts:710` — `const [first, second] = transport.sent.map(routeOf)` then
  `expect(first).not.toBe(second)`.

Both pass today because the boot probe happens to land after the call under test. The second is the
worse one: if the probe ever lands first, `first` is `GET /v1/health`, `second` is the first PUT,
the assertion passes, and it has stopped testing that two uploads mint two ids. Should be
`asked(transport)`.

### 9. `client.reachable` is never read in a test

The reachability tests assert the *effects* — a drain happens, the probe count backs off, it stops
once answered — which is the right thing to assert and covers the mechanism well. But
`apps/ui/src/lib/reachable.svelte.ts` now renders straight from `client.reachable`, and nothing
anywhere asserts the observable's values: that it starts true, goes false on a failed request, and
comes back. One test reading it across those three moments.

---

## Minor

### 10. `mirror` is on the *Avoid* list it is being used against

`CONTEXT.md`'s new **Cache** entry lists `mirror` under _Avoid_, and `CONTEXT.md` separately defines
**Mirror** as the pool's plain-file copy. `client.md` ("The store mirrors the cache") and
`persist.ts:98` ("The store is a mirror of the cache") both use it anyway, for a third relationship.
The word is load-bearing elsewhere in this project; `persist.ts`'s own function is called
`mirrored`. Either the Avoid entry is wrong or the prose is.

### 11. `isThePoolWeCached` shadows `held`

`client.ts:141` — `const held = state.get().pool` shadows `const held = writable<ClientState>(…)`
from `client.ts:99`, and the closure below reads the inner one. Both are correct; a reader has to
check which. Renaming the pool identity `cached` or `ours` costs nothing.

### 12. `listOf` and `retained` are O(n) per state emission

Already called out in the PR body, so this is confirmation rather than news. `drawnFrom` copies,
filters and sorts the whole cache on every emission while a surface is cache-drawn, and `retained`
copies and filters on every update past 500. The PR body says "bounded by retention" — finding 2 is
that it is not, and finding 1 is that cache-drawn is entered more often than intended. Fixing those
two makes this a non-issue; leaving them makes it a growing one. No independent action.

---

## Non-issues

Checked because they were raised, and clear:

- **`startWith(hydrated.items)` cannot write over a collection that failed to read.** `hydrate`'s
  `read()` falls back to `[]` on failure, so a failed `readItems` gives an empty `hydrated.items`;
  `persist.ts`'s `write` derives `gone` from `before` only, so an empty `before` removes nothing.
  The seed is safe in both directions — a failed read writes nothing over the store, and a
  successful read that retention trimmed does reach it, which is what the seed is for.
- **`intoPage` returning a cache-drawn page untouched cannot leave a half-drawn page.** A page with
  ids is not cache-drawn, and `extended` sets `after` whenever `next` exists, so `forget` emptying a
  pool-answered page leaves `after` set and the page stays the pool's. The only re-entry into the
  cache-drawn state is finding 1's turn, and that is a whole replacement rather than a half-draw.
- **The 5xx rule is implemented in both places it needs to be** — `watching` reports
  `status < 500`, and `undecided` throws `Unreachable` so `askedHealth` agrees with it. Untested
  (finding 7), not wrong.
- **`retained` runs on hydration.** `hydrate` writes through the wrapped `state`, so a store that
  grew past the cap in a previous session is trimmed on the way in and the trim reaches the store.

---

## Resolution

To be filled in after the co-review.
