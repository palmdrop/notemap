# Review: What a folder takes is the host's, not a setting

**Date**: 2026-08-19
**Status**: Resolved
**Scope**: PR #18 — `packages/adapters/destination-fs/`, `apps/daemon/`, `apps/ui/src/lib/`, `docs/specs/http-v1.md`
**Spec**: `docs/specs/http-v1.md`

---

## Overall

The refactor is clean and complete on the code side: `accepts` leaves the settings schema, the
reader, the fixture and the OpenAPI example; the host's value becomes a required constructor
argument, so no call site can forget it and there is no fallback branch left to reason about. The
UI keeps its list-shape coverage by moving it off the component test and onto `schema-form`
directly, which is the right place for it. Typecheck, lint, format, `pnpm -r test` and
`pnpm test:stack` are all green.

What is missing is the paper trail. `docs/plans/destinations-in-the-pool.md` is **Status: Done**
and states the opposite of what this branch just did, and the one comment in the code that
explains the rule — in `ports.ts` — still describes the fallback that was deleted. Neither is a
defect; both are the thing this project's rules single out as the failure (docs and code
disagreeing, a comment claiming something the code does not do).

---

## Bugs

None.

---

## Design

### 1. A Done plan now asserts the reverse of the code

`docs/plans/destinations-in-the-pool.md:70-71` — phase 3 is ticked with

> - [x] `accepts` moves from adapter construction into the kind's settings; capabilities are
>   computed from the destination it is handed

which is exactly what this branch undoes. A completed plan is a record of what was done, so it
should not simply be rewritten; but leaving it as the only planning document on the subject means
the next reader takes it as current. `apps/daemon/README.md` is the only place the new rule is
written down, and a README is not where this project keeps decisions.

Fix: a dated superseding note on that plan's line (or in its `Closed:` header) pointing at this
change, in the same commit as the code. Whether it also deserves a paragraph in ADR 20 — which
says a kind publishes a `settingsSchema` a person fills in, and this narrows what that schema may
hold — is your call; the ADR is not contradicted, only bounded.

### 2. Nothing can now say "this vault does not take images"

`packages/adapters/destination-fs/src/destination.ts:75` — every filesystem destination reports
the same capabilities, accepting every payload type the config declares. Per-destination
`accepts` was the only mechanism in the system for refusing a payload type at one destination and
allowing it at another; `payload-type-unsupported` (`route.ts:83`) can now only fire for a kind
that does not speak the type at all, which for `filesystem` is never.

I think the change is right — the fenced-JSON fallback means a folder *can* hold anything, so
refusing was a preference dressed as a capability — but the preference is real and has nowhere to
go. Worth one sentence somewhere durable saying that per-destination filtering, if it comes back,
is routing policy and not a capability. Otherwise the next person to want it will re-add the
settings key.

### 3. Rows already holding `accepts` become `unusable`

`packages/adapters/destination-fs/src/settings.ts:16` keeps `additionalProperties: false`, and
`usability.ts:33` validates a held row's settings against the kind's schema on every read. Any
destination created before this change reports

```
its settings no longer satisfy the filesystem kind: /accepts additionalProperties
```

and routing to it is refused. That is the greenfield policy working as stated, not a bug, and
there is a recovery path — `edit` validates only the incoming settings (`lifecycle.ts:89`), so
saving the form the new schema builds repairs the row. Say so in the PR description; a dev pool
that goes quiet about a destination with no explanation is a bad ten minutes.

---

## Minor

### 4. The comment in `ports.ts` describes the deleted fallback

`apps/daemon/src/ports.ts:60-61`:

```ts
// Every payload type has a rendering, the fenced-JSON fallback being the
// floor, so a folder that was not told what it holds takes everything.
```

There is no longer a folder that was or was not told anything — every folder takes everything,
unconditionally. This is the only place in the code where the rule is written, and it now states
a conditional that cannot occur.

### 5. `schema-form.ts`'s header now overstates what is used

`apps/ui/src/lib/schema-form.ts:2` — "the two shapes notemap's schemas use: a string and a list of
strings". `accepts` was the only array-typed property in any settings schema in the repo, so the
`list` branch is now unreached by any real kind. Keeping the support is fine; the comment should
say a schema *may* use them rather than that they are in use.

### 6. `const accepts = config.accepts` earns nothing

`packages/adapters/destination-fs/src/destination.ts:59` — the alias existed to apply the `?? []`
default. With the field required it is a rename of a property that is read once, twelve lines
below. `capabilitiesFor(config.accepts)` says it.

---

## Non-issues

- **`FilesystemSettings` is a one-field type with a hand-written reader** — the JSON→type boundary
  is still a boundary even when the type is one string; `asFilesystemSettings` is what stops a row
  that once passed a schema from being trusted as a type.
- **`DestinationForm.svelte` renders a `list` field as a plain input** — `kind` only ever affected
  `valuesFrom`/`typedFrom`, never the markup, so dropping the array property from the component
  test lost no rendering coverage. The new unit tests cover the part that mattered.
- **`accepts: []` leaves a kind that accepts nothing** — reachable, since `payloadTypes` defaults
  to `[]` (`config/load.ts:127`), and no longer escapable per destination. It is moot: the same
  config refuses every capture as `unknown-payload-type` (`payload.ts:22`), so a pool that can
  hold nothing has nothing to route.
- **`openapi.json` and `generated.d.ts` hand-edited in the diff** — `openapi.test.ts:60` fails on
  drift and passes, so the checked-in document matches what the app serves.
- **The daemon route test swapping `accepts: ["text"]` for `depth: 2`** — it needs any key the
  schema declines, and `depth` will not become one by accident.

---

## Resolution

1. **Fixed.** The ticked line in `destinations-in-the-pool.md` carries a dated note saying it was
   reversed and why, in the plan's own style, rather than being rewritten.
2. **Fixed.** The PR description already said an opt-out should arrive as an `excludes`, so a
   newly declared payload type is taken by default; the review was written blind to it. That
   reasoning is worth more than a PR body's lifetime, so `apps/daemon/README.md` now says one
   folder taking less than another would be routing policy rather than something the folder
   cannot do.
3. **Already answered.** The PR description states it: the row reports `unusable` rather than
   being dropped, and one save through the edit form clears the key. Greenfield, so no store
   migration.
4. **Fixed.** The comment states the rule the code has: a folder takes everything the pool can
   hold.
5. **Fixed.** "the two shapes a settings schema may take".
6. **Fixed.** `capabilitiesFor(config.accepts)`, alias gone.
