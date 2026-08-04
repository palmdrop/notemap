# Spec: The mirror on disk

**Status**: Stub — to be written properly in a dedicated grilling session
**Last updated**: 2026-08-02
**Shipped**:

---

## Outcome

Everything worth keeping accumulates as plain files while notemap runs, without notemap ever
reading them back. A lost pool is rebuilt from the mirror and the assets alone, and
uninstalling notemap costs nothing but the tooling.

---

## Scope

### In scope

- The on-disk layout and file formats of `pool-mirror/` and `assets/`.
- What is mirrored, and how each kind of state is laid out.
- Write semantics: when mirror writes happen relative to pool writes, and what a failed write
  means.
- The rebuild procedure, and verification/repair.

### Out of scope

- The mirror as an interop surface. It is a safety net; nothing builds against it
  ([standards.md](../standards.md#conformance)).
- Routed-output formats at destinations — the router's concern, per
  [standards.md](../standards.md#routing-dialects-one-item-many-destinations).

---

## Behavior

What is already settled, extracted from [core.md](core.md) and
[ADR 1](../adr/0001-pool-is-a-database.md). Everything else in this spec is unwritten.

- **Write-only.** The mirror is never read during normal operation. Rebuild is the only time
  mirror text is read; media bytes in `assets/` are the single runtime exception.
- **Lossless.** A pool is rebuildable from the mirror and assets alone, kept honest by a
  round-trip property test (pool → mirror → pool).
- The mirror carries captures, classification, artifacts and their corrections, and routing
  records. It does not carry pending suggestions, which are regenerable by definition, nor the
  accepted/rejected suggestion history (decided 2026-08-02): a rebuilt pool loses the rejection
  signal, and that loss is accepted.
- **The mirror carries material, not operational state** (decided 2026-08-03). Captures,
  enrichment artifacts and the durable human-owned state around them are mirrored. The action
  log ([ADR 12](../adr/0012-core-keeps-an-append-only-action-log.md)), job rows and leases are
  not: they describe how notemap ran, not what the user kept, and a pool rebuilt without them
  is not missing anything of the user's. A rebuilt pool therefore has no history.
- **Mirror writes are asynchronous** (decided 2026-08-02). They go through the same job/lease
  machinery as enrichment; a capture never fails because a mirror write did. The lossless
  claim is therefore "lossless up to pending mirror jobs", and the verify/repair operation
  closes the gap — backup tooling runs it first.
- **Media is stored once**, in `assets/`, referenced by both the pool and the mirror. Blobs are
  **content-addressed** and sharded by hash prefix
  ([ADR 13](../adr/0013-assets-are-named-references-to-content-addressed-blobs.md)); a blob's
  name is its own SHA-256, so drift is detected and reported, never silently absorbed.
- **The mirror records each asset's filename beside its blob reference** (decided 2026-08-04).
  `assets/` is therefore not browsable the way a folder of named files would be: a human who has
  lost notemap finds the bytes by reading the mirror's text, which names them. This is an
  accepted narrowing of the mirror's promise — the data is there and findable, not arranged the
  way it arrived.
- An external tool editing or deleting mirror text cannot corrupt the pool.
- Format: CommonMark + YAML frontmatter with a state sidecar. Frontmatter vocabulary per
  [standards.md](../standards.md#identity--provenance-the-cross-app-glue).
- Layout sketch (ADR 1, amended by ADR 13): `state/`, `pool-mirror/YYYY/MM/DD/` and
  `assets/<hash-prefix>/` as siblings; the backup unit is the whole `notemap/` directory.
- **The mirror writer and the asset store are ports** — a different driver could put the same
  bytes elsewhere without touching the domain.
- Pre-freeze the format is cheap to change: the mirror is regenerable from the database
  ([ADR 9](../adr/0009-versioned-api-mutable-until-first-real-pool.md)).

---

## Constraints

- Tombstones are **not** carried. A rebuilt pool has no purge history; the consequences for
  clients live in [sync.md](sync.md).

---

## Open questions

- [ ] 2026-08-02 — Whether the mirror may be disabled per pool. **The default is on**
      (decided 2026-08-02); what remains open is whether a disable setting is offered at all,
      and when. If so: the drop-and-rebuild migration path of
      [ADR 9](../adr/0009-versioned-api-mutable-until-first-real-pool.md) no longer applies to
      that pool, the SQLite file becomes the only copy, and re-enabling is a full re-mirror
      via the verify/repair operation.
- [ ] 2026-08-02 — File naming and collision handling; what "named for a human" means
      concretely.
- [ ] 2026-08-02 — The state sidecar schema: where tags, routing records, artifacts and
      corrections live, and how a revision chain is laid out across files.
- [ ] 2026-08-02 — In-place amendment of the head: rewrite the mirror file in place, or
      append?
- [ ] 2026-08-02 — The verify/repair operation: what it checks, what it reports, what it
      fixes.

---

## Acceptance criteria

Already stated in [core.md](core.md), owned by this spec once written:

- A pool rebuilt from its mirror and assets is equivalent to the original: same items, same
  order, same classification, same artifacts, same routing records.
- Deleting or editing a mirror text file leaves the pool unaffected.
- Editing an asset outside notemap is reported as a change rather than passing unnoticed.
