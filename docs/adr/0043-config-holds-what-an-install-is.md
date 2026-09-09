# 43. `config.toml` holds what an install is

**Date**: 2026-09-09
**Status**: Accepted — narrows [ADR 20](0020-destinations-are-pool-state.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

Three blocks in `config.toml` described the domain rather than the deployment: `[[payloadTypes]]`,
`[[sources]]` and `[[enrichments]]`. Each was written as a thing an operator configures, and none
of them was.

`[[payloadTypes]]` had exactly one correct value. Both shipped files — the annotated example and
the container's — declared `note` with the same schema, the client hardcodes that name in the
envelope it sends, and the schema defaulted to `[]` when the block was absent: a daemon started
without it refuses every capture as `unknown-payload-type`, and, because the host derives each
filesystem capability's `accepts` from the same list, its destinations accept nothing. Editing it
could only break things. Renaming the type orphans every item already stored under the old name,
which no edit may change ([ADR 38](0038-text-and-image-collapse-into-one-payload-type.md)); adding
one gets a fenced-JSON delivery and a shell that draws nothing, because a new type is a code change
everywhere it is read.

`[[sources]]` and `[[enrichments]]` had no readers at all. Core never looked at `config.sources` —
capture says so in a comment — `autoRequest` was assembled and never consulted, and enrichment
throws `notImplemented` from every method it has. `GET /v1/sources` answers what the items say, not
what the file says.

So all three read as switches and were not, in a file whose other keys are all live.

---

## Decision drivers

- **A config file should hold what is settled when notemap is installed on a machine**: paths,
  addresses, cadences, limits, and the accounts that carry a password. Anything a person changes
  while *using* notemap is pool state, which is [ADR 20](0020-destinations-are-pool-state.md)'s
  reasoning and applies unchanged here.
- **A key that cannot usefully be changed is worse than a missing one**, because it invites the
  edit that breaks the install and documents a seam that does not exist.
- **Dead configuration is dead code with a manual.** Two of the three blocks were parsed, mapped
  onto `PoolConfig` and read by nothing.
- **Core is instantiated per pool and takes configuration as data.** Whatever replaces the payload
  types must not become module-level state or an ambient default core reaches for on its own.

---

## Considered options

1. **Remove all three from the file; core exports the payload types and the host hands them back.**
2. **Remove all three from the file; core reads its payload types itself.**
3. **Keep the blocks and document them as things not to touch.**

---

## Decision outcome

**Option 1.** `PAYLOAD_TYPES` is a constant core exports, and a host puts it on the `PoolConfig` it
builds. `PoolConfig.payloadTypes` stays, so `checkPayload` still validates against a list it was
given rather than one it found, and a test can hand a pool types nobody ships. `PoolConfig.sources`
and `PoolConfig.enrichments` are removed outright, along with `SourceDescriptor`,
`EnrichmentDescriptor` and `autoRequest`.

Option 2 was rejected for the seam rather than the ceremony: a pool that reaches for its own
payload types is a pool with ambient configuration, and the integration tests that check what a
pool does with a type the shipped list has never heard of would have nowhere to say it.

Option 3 keeps a footgun and calls it documentation.

### Consequences

- **A leftover block warns and is ignored**, through the mechanism every unknown key already uses:
  `notemap: ignoring payloadTypes, which this daemon does not know`. There is no deprecation path
  and no grace period — notemap has one user, and a warning naming the key is the whole of what a
  deprecation would have bought.
- **A second payload type is a code change**, which it already was. [ADR 38](0038-text-and-image-collapse-into-one-payload-type.md)'s
  rule for when one exists is unaffected; where it is written down moves from a file to a constant.
- **Source policy has no home until it needs one.** `core.md` said policy would move to pool state
  when enrichment exists, on the destinations' pattern but with no create, since a source is
  discovered. That is still the plan; the empty registry that was holding its place is gone.
- **A daemon started with an empty `config.toml` now captures.** It could not before: the payload
  types defaulted to none.

---

## Pros and cons of the options

### Core exports the types, the host hands them back

- Good, because the one value that works is the one every host gets, and no file can disagree
  with the client that hardcodes it.
- Good, because `PoolConfig` keeps a shape a test can vary, which is what the integration fixture's
  second type is for.
- Bad, because a host must remember to pass it — a line of ceremony for a value with no
  alternative.

### Core reads its own payload types

- Good, because nothing can be wired wrong.
- Bad, because it is ambient configuration inside a pool that is meant to be instantiated per pool
  and given everything.

### Keep the blocks

- Good, because nothing changes and a future extension has a place to land.
- Bad, because two of them extend nothing and the third extends nothing usefully.
- Bad, because the absent-means-empty default turns an omitted block into a daemon that refuses
  every capture.

---

## More information

`[[accounts]]` stays, and belongs: it is per-install and it carries a password, which is why it
was never pool state in the first place. Making an account editable from the UI is not a move of
this kind — it needs somewhere a secret can live that the mirror does not write and an access
token cannot read.
