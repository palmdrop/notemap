# 30. A destination can be asked whether it is really there

**Date**: 2026-09-02
**Status**: Accepted — extends the routing section of [core.md](../specs/core.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

The settings screen has a control that asks a destination what it can do, and a person reasonably
reads its answer as "this destination works". It is not. `describe()` touches neither disk nor
network by design ([ADR 26](0026-a-destination-can-be-asked-what-an-argument-could-hold.md)), so a
filesystem destination over an unmounted drive and a webdav one naming an account nobody declared
both answer `described`, cheerfully, with their full list of capabilities. The first evidence that
either is wrong is a delivery that does not land.

The developer's words for it: *"the check only calls the adapter, not the actual destination. Would
be great to have a way to ping a destination so that the user knows it is correctly configured."*

So: how does a person find out that a destination is genuinely reachable, without giving up the
property that makes deferred delivery work?

---

## Decision drivers

- **`describe()` must stay offline-safe.** A destination that is merely asleep has to remain
  routable, with the record made and the delivery deferred. Both ADR 26 and
  [ADR 28](0028-a-remote-destination-names-a-credential-profile-not-a-url.md) rest on this, and
  ADR 28 names it explicitly: `describe()` doing I/O "would make every settings screen stall on a
  destination that is merely asleep".
- **A configuration mistake and an absence look identical today.** A renamed account, a wrong
  password, a folder someone moved, and a server that is down all reach a person as the same
  silence — a pending delivery — and only three of the four are worth acting on now.
- **The domain already has the words.** `DeliveryOutcome` is `delivered | unreachable | rejected`.
  Inventing a second vocabulary for the same distinction, one call earlier, would be two names for
  one fact.
- **Not every kind can answer this,** and one that cannot must be distinguishable from one that
  tried and failed — the same problem `candidates` already solved.
- **A check must not write.** Proving a destination is writable means creating and deleting a file
  in somebody else's vault. Nobody presses a button called "check" expecting that.

---

## Considered options

1. **Make `describe()` go and look**, and let the settings screen wait.
2. **Fold it into `candidates`** — asking what a field could hold already reaches the destination,
   so a caller could read a successful answer as proof of reach.
3. **A third method, `probe`**, asked through a call of its own, optional on the adapter, answering
   in `DeliveryOutcome`'s vocabulary.

---

## Decision outcome

Chosen: **option 3**. `probe` joins `describe` and `candidates` on `DestinationKindAdapter` and the
`Destinations` port, and is asked through `GET /v1/destinations/{id}/probe`.

The answer is one of:

| | means |
| --- | --- |
| `ready` | it was reached, it accepted the credentials, and the root is there |
| `rejected` | it answered, and said no: a wrong password, a folder that is not there, an account nobody declared |
| `unreachable` | it could not be reached at all, or could not decide |
| `unusable` | it could not be asked, on `DestinationReport`'s own terms |
| `not-offered` | the kind does not do this, whether it said so or never implemented it |

**`rejected` against `unreachable` is the distinction the feature exists for.** One is a thing a
person must go and fix; the other will fix itself, and the delivery runner is already retrying it.
The words are `DeliveryOutcome`'s because it is the same distinction one call earlier, and a second
vocabulary for it would have to be kept in step forever.

**Optional on the adapter, and the port always answers**, exactly as `candidates` settled it: a kind
that never implemented `probe` and a kind that refused are one fact to a caller — nothing here can
be asked — so the registry turns an absent method into `not-offered` and nobody checks two things.

**`ready` does not mean writable.** The probe reads: it resolves the account, opens a connection,
presents the credential and asks whether the root is there. A filesystem destination is the one
exception where more is free — the kernel will say whether the root is writable without anything
being written — and it takes that answer. Nothing anywhere creates a file to find out. Writability
is inferred from reaching the place, and the spec says so rather than implying it.

**An undeclared account, or a secret that cannot be read, is `rejected`.** This narrows ADR 28,
which routes that same fact through `unreachable`. What that decision protects is *retry semantics*
— a delivery that could not read a credential must stay pending and be attempted again, on the same
terms as an unmounted drive — and a probe has no retry semantics to protect. It is a person asking a
question, once, and the true answer is "this is misconfigured, and waiting will not fix it". The
delivery path is unchanged.

### Consequences

- **Good** — "is this configured correctly?" becomes a question with an answer, asked before a
  routing decision rather than discovered after one.
- **Good** — `describe()` keeps its constant-time, offline-safe contract, and every argument that
  rests on it stands.
- **Good** — a kind that never implements `probe` degrades to exactly what the settings screen shows
  today, with a reason.
- **Bad** — two calls now reach a destination and can each be slow or refused, and the settings
  screen makes both per row. Accepted: that screen exists to answer this question, and no other
  surface probes.
- **Bad** — `ready` is a weaker claim than a person will read it as. Mitigated by saying so, not by
  making the probe stronger.
- **Neutral** — the delivery runner does not consult the probe. What a delivery finds out is still a
  delivery's to find out.

---

## Pros and cons of the options

### Make `describe()` go and look

- **Good** — no new method, no new route, and the existing control becomes truthful.
- **Bad** — reverses the one property ADR 26 and ADR 28 both build on. A settings screen would stall
  on a sleeping Nextcloud, and a destination that could not be reached would stop being *routable*,
  which is the whole of what deferred delivery is for.

### Fold it into `candidates`

- **Good** — one fewer method; the call already reaches the destination.
- **Bad** — a kind that offers no candidates could then never be checked, and webdav is exactly that
  kind. It also asks a bigger question than the one being asked: enumerating a vault to find out
  whether it answers is expensive, and a truncated list is not evidence of a root being there.

### A third method

- **Good** — one call, one question, one answer, and each of the three reaches can be slow or refused
  independently of the others.
- **Bad** — a third thing every kind may implement, and a third thing the settings screen waits on.

---

## More information

Plan: [destination-checks-and-accounts.md](../plans/destination-checks-and-accounts.md), phases 4
through 6. The route, the client method and the settings row are built there.

Revisit if a kind arrives whose "is it there" question cannot be answered without writing, or if the
delivery runner ever wants to consult a probe before attempting — at which point what wants deciding
is whether a probe's answer may be *cached*, which nothing here allows.
