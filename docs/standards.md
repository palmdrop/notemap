# Standards & interop

The formats and vocabularies notemap uses so it can act as the **bus** for a family of
local-first tools. notemap is the **store / router** (and the host of advisory
**enrichment**): captures enter its inbox from any source, get enriched without mutation, and
are routed out to destinations. Every choice here is a widely-adopted, vault-native open
standard, so that ingesting from another tool in the family and routing to the Obsidian vault
are the same move.

The principles behind these choices, stated here so this repo stands on its own:

1. **Local-first, self-hosted.** No third-party cloud in the data path.
2. **Plain files are the source of truth for material that has come to rest** — at
   destinations, and in the mirror. Not for every store; see
   [ADR 1](adr/0001-pool-is-a-database.md).
3. **Originals are immutable; processing is additive.** Preservation is a default the user can
   override, not a lock.
4. **Enrichment is advisory.** Automated steps propose; a human ratifies.
5. **One writer per file.** Exactly one process is authoritative for any given file.
6. **Fast capture, deliberate processing.** Capture asks no questions; filing happens later.
7. **Provenance is first-class.** Anything processed can be traced back to its capture.
8. **Composable small tools over monoliths.** Items flow between tools.
9. **Open, widely-adopted formats only.** A boring standard beats a clever bespoke one.
10. **Degrade gracefully offline.** Capture always works; anything needing the network queues.

See also the concrete flows: [fast-notes](exploration/flows/fast-notes.md),
[voice-notes](exploration/flows/voice-notes.md), and the model in
[exploration/vision/unified-app.md](exploration/vision/unified-app.md).

---

## The ingestion contract (the inbox)

Everything enters as a **capture envelope**: a source-agnostic JSON object wrapping a typed
payload. Memos, a voice recorder, a browsing-graph capture and a share-target all produce the
same envelope shape.

| Concern | Standard | Notes |
|---|---|---|
| Envelope design | **ActivityStreams 2.0** vocabulary (as a reading, not a hard dep) | A capture is a `Create` activity over a typed object: id, `published`, actor/source, object. |
| Transport | [Micropub](https://www.w3.org/TR/micropub/)-shaped endpoint over the native JSON envelope | Single endpoint, OAuth2, create/update/delete. Any Micropub-ish client can feed the inbox. Expose it as one adapter; don't let Microformats2 constrain the richer item model. |
| Schema | JSON Schema per payload type | The executable lock: envelope + each payload validated against a shared schema. |

**Hard rule (from the philosophy):** enrichment produces output **attached to the item, never
mutations**. The original capture is immutable; transcript, tags and destination guess are
layered beside it.

*Amended 2026-08-02* ([ADR 6](adr/0006-enrichment-splits-into-suggestions-and-artifacts.md)):
that output is of two kinds. A **suggestion** — a tag, a title, a destination — is a proposal
that means nothing until accepted or rejected, and accepting it writes state carrying the
attribution of whichever agent produced it. An **artifact** — a transcript, an embedding — is
durable, stands on its own, and is never ratified; correcting one is not an edit of the
capture. There is no "type guess": classification is tags only.

---

## Payload types

The item payload is `(type, blob/JSON, metadata)` — kept open-ended so new capture kinds
don't require model changes.

| Type | Standard |
|---|---|
| text | CommonMark + YAML frontmatter |
| voice / audio | audio blob + **WebVTT** timed transcript (word-level timestamps, ground truth for correction) + formatted Markdown |
| link / bookmark | URL + **SingleFile HTML** snapshot (preserved original) + extracted [Open Graph](https://ogp.me/)/schema.org metadata; [Netscape bookmark format](https://en.wikipedia.org/wiki/Bookmark_(digital)#Storage) for bulk import |
| web annotation | [W3C Web Annotation Data Model](https://www.w3.org/TR/annotation-model/) (JSON-LD) |
| walk (graph) | [JSON Canvas 1.0](https://jsoncanvas.org) + Web Annotations by node/edge id + Markdown outline — a browsing session captured as an annotatable graph |
| collection | membership (many-to-many item ↔ collection) over any of the above |
| table | CSV (Frictionless Data Package when structure matters) |
| palette / board | typed JSON blob + renderer; boards can serialize as JSON Canvas |

---

## Identity & provenance (the cross-app glue)

- **Identity:** UUIDv7 (time-ordered) for every item/enrichment/collection; content hashes
  **recorded for** immutable assets (snapshots, audio) — *amended 2026-08-02*
  ([ADR 1](adr/0001-pool-is-a-database.md)): assets are addressed by path, not by hash, since a
  hash filename is unusable for a human and becomes a lie the moment the file changes. The hash
  is metadata used to detect drift; sharing is a reference count. Reference across systems with
  the
  `urn:commons:item:<uuid>` URI namespace ([RFC 8141](https://datatracker.ietf.org/doc/html/rfc8141)).
  A web resource = URL + capture time ([Memento](https://datatracker.ietf.org/doc/html/rfc7089)).
- **Provenance:** the three [W3C PROV](https://www.w3.org/TR/prov-o/) relations, as
  frontmatter keys (not full RDF):
  - `wasDerivedFrom` — processed artifact → original capture
  - `wasGeneratedBy` — enrichment output → the activity/model that produced it
  - `wasAttributedTo` — the agent: a human decision vs. `whisperx-medium` vs. `qwen3-4b`
  - `wasRevisionOf` — a revision → the capture it supersedes. Edits are **appends, not
    mutations**: a new item carrying the original `created` plus an `updated` timestamp,
    linked back to its predecessor ([exploration/vision/pool-and-routing.md](exploration/vision/pool-and-routing.md#edits-are-revisions-not-mutations)).
- **Routed-artifact frontmatter vocabulary** — every item that leaves notemap carries, in
  YAML frontmatter, [Dublin Core](https://www.dublincore.org/specifications/dublin-core/dcmi-terms/)
  terms (`title`, `creator`, `date`, `source`) plus `source_id`, `captured_at`,
  `capture_source`, `derived_from`. That is what lets an item that has *left* the hub still
  be traced back, re-enriched, or re-routed.

---

## Routing dialects (one item, many destinations)

The vault-specific link syntax is applied by the **router**, not baked into the item model,
so different sinks emit different dialects from the same item:

| Destination | Dialect |
|---|---|
| Obsidian vault | CommonMark + Obsidian-flavored `[[wikilinks]]` / `![[embeds]]`; walks as `.canvas`; voice as `.md` + audio embed (see [voice-notes.md](exploration/flows/voice-notes.md)) |
| fragment sink (weighted tags) | Markdown fragment + frontmatter with weighted-tag **aspects** (`aspects: [{name, weight}]`) — notemap's tag/enrichment layer with weights attached |
| project collection | membership + processed-artifact layer referencing preserved originals |
| other platforms | generic webhook/exporter interface |

One writer per file: only the server-side router touches vault files.

Routing is **non-destructive and append-only**: the capture stays in the feed, and each
delivery appends a `(destination, timestamp, pointer)` record — a list, not a boolean, since
one item may be routed to several destinations. The pointer is best-effort; the destination
is someone else's system, so a stale pointer records where a note *once went* rather than
guaranteeing where it is. Adapters declare which verbs (`create`, `append`, `place`) they
support per payload type. Full model: [exploration/vision/pool-and-routing.md](exploration/vision/pool-and-routing.md#destinations-and-the-routing-table).

---

## Conformance

- **Roles:** store / router (+ enrichment). **Tier 3** (live ingestion API) — it *is* the
  bus other apps hook into.
- **The pool is private** (*added 2026-08-02*, [ADR 1](adr/0001-pool-is-a-database.md)). notemap
  owns its storage outright; nothing reads or writes it directly. Other tools interop with
  notemap either through **routed output** — plain files at the destination, which is where
  file-level sharing actually happens — or as **Tier 3** API clients. The plain-file mirror
  notemap writes is a safety net, not an interop surface: it is write-only and nothing should
  build against it.
- **Enrichment providers:** every enrichment step is an adapter, configured not compiled.
  Transcription's contract is *audio in → (text, WebVTT word-level timestamps, language,
  confidence, is-speech) out*, asynchronous, with a completion signal; the pragmatic wire
  format is an **OpenAI-compatible `/audio/transcriptions` endpoint**, with a generic webhook
  adapter as the escape hatch. Transcription and *correction* are separate capabilities — most
  providers offer only the first. Each provider carries a trust level (local-only by default)
  and is named on the item via `wasAttributedTo`.
  See [exploration/vision/audio-intake.md](exploration/vision/audio-intake.md#transcription-is-a-provider-not-a-component).
- **Enrichment infra** (not a wire standard, recorded for completeness):
  [sqlite-vec](https://github.com/asg017/sqlite-vec) embedding index with a multilingual
  Ollama model (`bge-m3` / `multilingual-e5-small`) — powers destination suggestions and
  cross-system search ([exploration/vision/semantic-search.md](exploration/vision/semantic-search.md)). Keeps the
  item store and vector index in one file.

---

## Considered, not adopted

- **Full RDF / PROV-O ontology, JSON-LD framing** — adopt the *relation names* and Dublin
  Core *terms*; skip the triple store. Overkill for a personal hub.
- **ActivityPub federation** — the family is one person's tools, not a social network.
- **A dedicated vector DB (Qdrant/Chroma)** — solves a scale a personal vault never reaches;
  sqlite-vec keeps it to one file, one service.
