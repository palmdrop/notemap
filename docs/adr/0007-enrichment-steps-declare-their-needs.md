# 7. Enrichment steps declare their needs; the runner runs what is ready

**Date**: 2026-08-02
**Status**: Accepted

---

## Context and problem statement

Core owns the state of enrichment work while the host drives the loop
([ADR 2](0002-core-is-a-host-agnostic-library.md)). How are steps defined, and what makes one
eligible to run?

---

## Decision outcome

**Each step declares its inputs; the runner runs every step whose needs are currently
satisfied.** No pipeline graph is written down. Readiness is a predicate over the item's
state, which means one mechanism covers every case that would otherwise be a branch:

| Situation | Outcome |
|---|---|
| Provider not configured | step is **unavailable** |
| Step not requested (opt-in) | **not applicable** |
| Inputs not produced yet | **pending** |
| Ran and failed | **failed**, with attempts and backoff |

Those are distinct and all derivable, which is what makes *pipeline status on the phone* — a
gap named in [unified-app.md](../exploration/vision/unified-app.md#what-exists-vs-whats-missing) —
answerable rather than a perpetual "still working". An item's status is a query, not
bookkeeping.

Leases, attempt counts and backoff live on the job row; they are what crash recovery needs
regardless of how steps are declared.

**Whether a step is auto-requested is policy, and policy is per intake source.** A recording
arriving from the voice-memo app can transcribe automatically while a stray `.wav` uploaded as
a capture requires an explicit request. This composes with
[ADR 3](0003-clients-hold-an-outbox-pools-do-not-replicate.md), which already requires every
capture to carry a stable `(source, source_id)`.

The general rule it establishes: **core takes configuration as data; it just does not source
it.** Core defines the rule shape and evaluates it; the host reads the config file. That keeps
ADR 2's seam intact.

The non-speech case ("birdsong must not come back as a garbled transcript") is **not** the
justification for this design and has been loosened — detection quality is unproven, and the
first iteration of core ships with no transcription provider at all. The distinct
not-applicable state is required anyway, by unconfigured providers and opt-in steps.

### Considered options

- **Explicit pipeline per payload type.** Readable and diagrammable, but opt-in steps and
  missing providers become branches maintained inside every graph, and each new payload type
  needs another graph.
- **Event-driven subscriptions.** Trivially extensible, but item status must be reconstructed
  from event history — the one question the phone needs answered directly.
