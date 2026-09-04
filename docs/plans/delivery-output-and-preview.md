# What went, and what would go

**Date**: 2026-08-30
**Status**: In progress <!-- Todo | In progress | Done -->
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/mirror.md`, `docs/specs/client.md`, `docs/specs/shell.md`
**Closed**: <!-- YYYY-MM-DD, set when Status becomes Done -->

---

## Goal

> "What did I actually send to my vault?" is answerable, and askable in advance. A delivery may
> answer with the **output** it produced and a note about what it could not carry; the pool keeps
> both on the routing record; and a destination may be asked, before anything is committed, what it
> would write.

[ADR 19](../adr/0019-a-destination-converts-and-the-delivery-records-what-went.md) decided this in
2026-08-17 and nothing was built: `DeliveryOutcome` is `delivered | unreachable | rejected` with a
best-effort pointer and no more. Its closing line left preview open as "a third method on the port".
This plan builds both, and settles the question the two of them together raise.

It matters now because destinations are about to stop being faithful. A todo-list destination that
inserts one line prefixed `- [ ]` will flatten a capture and drop its pictures. That is allowed —
routing delivers a copy and the item is untouched — but it is only honest if the person can see it,
before by asking and after by looking. Without that half, lossy conversion is silent data loss.

**Decided 2026-08-30, and the ADR records it**: a preview is **indicative, never binding**. The
delivery converts again when it runs. The reservation stays a pure decision, which is what lets a
deferred delivery be attempted from the record alone (CONTEXT.md's **Routing record**), what keeps
bytes out of the mirror's copy of a decision, and what makes `append-to-file` possible at all —
the right output there depends on what the file holds at the moment of writing, not at the moment
of deciding.

**Out of this slice, deliberately**: templates and the configuration of them, rules, and anything
that decides *how* a destination converts. This plan carries the conversion's evidence, not the
conversion.

## Amended 2026-09-04 — the unknowns settled

Confirmed with the developer before phase 1 landed, and
[ADR 33](../adr/0033-a-lossy-delivery-carries-its-output-and-a-preview-is-indicative.md) records
the reasoning for the ones worth it.

- **The mirror carries the hash, and the bytes need no second home.** The largest unknown mostly
  dissolves: the mirror already carries no bytes for anything. `assets/` is one content-addressed
  store the blob driver writes and both the pool and the mirror reference, so an output stored
  through the same `BlobStore` lands there by construction. A mirrored record names the hash, the
  media type, the note and the URL, exactly as it names an asset's blob, and a rebuild beside a
  surviving `assets/` answers *what* was sent as well as where. `mirror.md` says what a rebuild
  from mirror text alone can and cannot answer.
- **The output of `append-to-file` is what was inserted**, not the file it was inserted into, and
  `create-or-append-file` follows it. The record answers what this delivery put there.
- **A preview needs no reachability for the filesystem kind**, which follows from the line above:
  if the output is the inserted bytes, converting them reads nothing at the destination. The port
  still allows `unreachable`, for a kind whose conversion does need to look.
- **The preview route is `POST /v1/items/{id}/route/preview`** — under the verb it previews, taking
  the same body. `/routing` on an item is the record list, and a preview is not about records. The
  output fetch follows the same rule and is `GET /v1/routing/{record}/output` rather than the
  plan's `/v1/routing-records/{id}/output`: `/v1/routing/{record}/cancel` is already the surface a
  record is acted on through, and a third noun for one route would be a spelling nothing else uses.
- **The record's output carries the blob hash on the wire**, beside the media type. It is not the
  content, an asset already answers its own blob, and it is the `ETag` the output fetch sets.
- **Over the wire a preview answers JSON**, `{ mediaType, note?, content }`, with the content
  inline as text: it stores nothing, so there is no bytes URL to hand out afterwards, and the shell
  draws a preview and a stored output through one component. The port keeps one output shape for
  both `deliver` and `preview`; only the daemon decodes.
- **The note stays prose.** ADR 33 says what would have to be true to change that.

---

---

## Tasks

### Phase 1 — The decision

Depends on nothing.

- [x] Create branch `agent/delivery-output-and-preview`
- [x] An ADR extending [ADR 19](../adr/0019-a-destination-converts-and-the-delivery-records-what-went.md).
      Three things worth the reasoning: a delivery **may convert lossily** and that is a delivery
      rather than a refusal, with `rejected` kept for a capture the destination can make no sense of;
      the record keeps the **output** and a short prose **note** about what was not carried; and a
      **preview is indicative**, with the alternatives it was chosen over — a binding preview whose
      bytes are committed with the decision, and a dry-run flag on `deliver`
- [x] Say why the flag was refused: it makes preview and delivery incapable of disagreeing, at the
      price of one boolean between showing a person something and writing into their vault, which
      core cannot verify and an adapter can get wrong once
- [x] `CONTEXT.md` gains **Output** — the content a delivery produced, which the record may name.
      Its Avoid line names rendition, artifact and receipt: rendition collides with **Rendering**,
      artifact belongs to enrichment and says so in ADR 19, and receipt implies the destination
      acknowledged something, which nothing here does
- [x] **Destination**'s Avoid line loses `output` in the same change and keeps `target` and `sink`.
      A glossary cannot both define a word and ban it; the ban was against calling a destination an
      output, and the entry can say so
- [x] Verify: the ADR is written and confirmed; `pnpm lint`
- [x] `git commit`

### Phase 2 — A delivery says what went

Depends on phase 1. Needs [destination-targets](destination-targets.md) phase 1 merged, which
renames the field beside these ones.

- [x] A delivered outcome may carry the **output**: the content, its media type, and a short prose
      note about what could not be carried. All three optional — a destination posting to an API
      may have nothing meaningful to keep and should not be made to invent one
- [x] The content is handed over as a lazy opener rather than bytes in hand, the shape
      `DeliveredAsset` already uses, so a large output is never buffered to be hashed
- [x] The note is free text nothing parses, on the same footing as the `detail` that already rides
      on `unreachable` and `rejected`. Resist giving it structure: a machine-readable list of what
      was dropped is a vocabulary both core and the shell would have to learn, which is the
      argument core.md:611 already had once
- [x] **The pointer gains a URL beside it.** The human-readable pointer stays what it is — a path a
      person recognises — and a destination that can offer a link offers one. The filesystem kind
      answers a path and no URL, permanently: a path on the daemon's host is not reachable from the
      phone reading the shell. Both are best-effort and both may be stale, which the glossary
      already says of the pointer alone
- [x] Core stores the content as a **blob**, because the store is content-addressed already
      ([ADR 13](../adr/0013-assets-are-named-references-to-content-addressed-blobs.md)) and routing
      the same content twice should cost one copy. The routing record names the hash, the media type
      and the note
- [x] A migration for the new columns, appended rather than edited — the file is tracked by
      `PRAGMA user_version` and says at the top that a migration is never edited once applied
- [x] **The sweep must not take an output.** It reclaims blobs no asset names, and an output is
      named by a routing record rather than an asset. Only a delivered record carries one and a
      delivered record is never removed, so nothing releases an output today — say that where the
      sweep is, so the reclaim [todo.md](../todo.md) still owes does not delete the evidence
- [x] The mirror carries the hash, the media type, the note and the URL on the record it already
      mirrors. Whether the mirror also carries the **bytes**, so a rebuilt pool can still answer what
      it sent, is the open question in this phase and the plan's largest — see Unknowns
- [x] Tests: an outcome with an output stores one blob and names it; the same output twice stores
      one blob; an outcome without one records nothing; the mirror round-trips
- [x] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`
- [x] `git commit`

### Phase 3 — The filesystem kind answers with what it wrote

Depends on phase 2.

- [x] `create-file` and `append-to-file` answer with the markdown they produced, its media type, and
      no note — this kind carries everything, writes the assets beside the note, and has nothing to
      confess. A kind with nothing to confess is the case that proves the note is optional
- [x] For `append-to-file`, settle and state which bytes are the output: what was inserted, not the
      file it was inserted into. The record answers what this delivery put there
- [x] Tests beside the adapter, over a temporary tree
- [x] Verify: `pnpm -r --silent test`
- [x] `git commit`

### Phase 4 — On the wire

Depends on phases 2 and 3.

- [x] A routing record answers with the note, the media type, the URL and whether it has an output —
      not the content, which is a separate fetch and may be large
- [x] `GET /v1/routing-records/{id}/output` answers the bytes with their media type. It carries the
      same inert headers an asset response does: this is content a destination produced, and
      `security.md`'s reasoning about bytes on the daemon's own origin applies to it unchanged
- [x] Refusals: no such record, and a record that has no output — which is ordinary and not an error
      condition anywhere else
- [x] Route tests beside the route, and the OpenAPI document regenerated
- [x] Verify: `pnpm --filter @notemap/daemon test`
- [x] `git commit`

### Phase 5 — A destination can be asked what it would write

Depends on phase 2, for the shape of what it answers.

- [x] `preview` joins `DestinationKindAdapter` and the `Destinations` port, **optionally** — a kind
      that has not implemented it says so, on the same not-offered footing as
      [destination-targets](destination-targets.md)'s question. It answers an output and touches
      nothing at the destination
- [x] It takes what a delivery takes, because that is what makes it faithful. Core builds the
      delivery without reserving anything: no routing record, no job, no lease, nothing appended to
      the log
- [x] It may fail `unreachable`. A preview of `append-to-file` may need to read the note it would
      append to, and a vault that is asleep cannot be previewed against — which does not stop the
      routing decision being made, only the seeing of it
- [x] Faithfulness is the adapter's discipline: `deliver` and `preview` share one conversion. Nothing
      in the port can enforce that, and the ADR says so rather than implying a guarantee
- [x] The filesystem kind implements it: the same markdown, without the write
- [x] Tests: a preview writes nothing to the temporary tree, and answers what a delivery would have
- [x] Verify: `pnpm -r --silent test`
- [x] `git commit`

### Phase 6 — Preview on the wire

Depends on phase 5.

- [x] **Proposed: `POST /v1/items/{id}/routing/preview`**, taking the destination, the capability and
      the arguments — the body a route takes, answering an output instead of a record. A `POST` that
      writes nothing, which wants a sentence in `http-v1.md` rather than being smuggled in. Confirm
      the shape before building it
- [x] It has the refusals routing already has — unknown destination, undeclared capability, arguments
      that fail the schema, payload type not accepted — plus unreachable and not-offered. A preview
      that refuses for the same reasons a route would is worth more than one that always answers
- [x] Route tests, and the OpenAPI document regenerated
- [x] Verify: `pnpm --filter @notemap/daemon test`
- [x] `git commit`

### Phase 7 — The composer asks, and the record view shows

Depends on phases 4 and 6, and on
[item-route-and-record-view](item-route-and-record-view.md) for somewhere to draw a record.

- [ ] The client can ask for a preview and fetch an output. Neither is an outbox operation, for the
      reason routing is not one: a decision made offline cannot be replayed, and a preview of a
      destination that could not be reached is not a thing to queue
- [ ] The composer offers a preview **on demand**, once the arguments are settled — never
      automatically. The conversion may be a model call, and the shell already reasons this way about
      I/O: only the chosen destination is ever described
- [ ] The preview says what it is: what this destination would write **now**, not a promise about
      what will be written. Where it differs from the delivery is where a converter is
      non-deterministic, and that is a fact about the destination rather than a fault
- [ ] Not-offered and unreachable are the ordinary conditions, drawn as such: no preview, a line
      saying why, and routing still available. Nothing here may block a decision
- [ ] The record view draws the note and the output, fetched when asked for, in the same component
      the preview uses — they are the same shape and reading them is the same act
- [ ] The pointer becomes a link where the record carries a URL, and stays text where it does not
- [ ] Tests in the client and the shell: a preview is asked for only when asked for, a kind that does
      not offer one is drawn without it, an unreachable destination does not prevent routing, and a
      record with no output draws without one
- [ ] Verify: `pnpm --filter @notemap/client test`, `pnpm --filter @notemap/ui test`
- [ ] `git commit`

### Phase 8 — The specs say so

Depends on everything above.

- [ ] `core.md`: the output on the record, the note, lossy conversion as a delivery rather than a
      refusal, and preview as a third question a destination answers — with the sentence that it is
      indicative, because that is the one a reader will come looking for
- [ ] `http-v1.md`: the output fetch, the preview route, and the `POST` that writes nothing
- [ ] `mirror.md`: what a mirrored record carries, and what a rebuilt pool can and cannot answer
      about what it sent
- [ ] `client.md`: neither is an outbox operation, and neither is cached durably
- [ ] `shell.md`: the preview in the composer, and the output in the record view
- [ ] `docs/todo.md`: the preview half of routing auto-processing closes and names this plan; the
      templates entry stays open and now has the seam it will use
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm lint`, `pnpm test:stack` — this
      crosses core, the store, the mirror, the HTTP surface, the client and the shell
- [ ] `git commit`

---

## Unknowns

- **Whether the mirror carries an output's bytes.** The record can name a hash the mirror does not
  hold, in which case a rebuilt pool answers *where* it sent and no longer *what* — which is exactly
  the half ADR 19 set out to fix, and its own text says "routing records are already mirrored, so a
  rebuild restores what was sent rather than only where". Carrying them means the mirror grows a
  second body of content beside `assets/`, for every delivery, forever. Fallback if that is too
  much: the mirror keeps the hash, the note and the media type, a rebuild answers what it can, and
  `mirror.md` says plainly that outputs are not restored.
- **What the output of `append-to-file` is.** Phase 3 proposes what was inserted. The whole file
  after insertion is the other reading, and it is what someone comparing against the vault would
  want — at the cost of storing the file's entire contents on every append.
- **Whether a preview needs to be reachable to be useful.** For the filesystem kind it is pure
  conversion and needs nothing; for `append-to-file` over WebDAV it may want the existing note.
  If most previews turn out to need the destination, the composer's offer is worth less than it
  looks and should say so before it is asked.
- **The preview route's shape.** A `POST` that writes nothing is the proposal; `http-v1.md` may
  already have a view. Fallback is a route under the destination rather than the item, which reads
  worse — the question is about *this item at that destination*.
- **Whether the note stays prose.** It will be tempting to structure it the first time a shell wants
  to draw "2 assets not carried" as a mark rather than a sentence. The ADR should say what would
  have to be true to change that.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The blob and the record are core's and are tested there, including that one output stored twice
costs one blob. The adapter's output and its preview are tested over a temporary tree, and the
preview's test is as much that it wrote nothing as that it answered. The routes are tested beside
themselves; the composer and the record view in the shell's suite. Phase 8 runs `pnpm test:stack`,
because this crosses every layer there is.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
