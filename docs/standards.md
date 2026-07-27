# Standards & interop

The formats and vocabularies notemap uses so it can act as the **bus** for a family of
local-first tools (shared philosophy: `~/repos/commons/PHILOSOPHY.md`). notemap is the
**store / router** (and the host of advisory **enrichment**): captures enter its inbox from
any source, get enriched without mutation, and are routed out to destinations. Every choice
here is a widely-adopted, vault-native open standard so that ingesting from
[web-walks](../../web-walks/docs/standards.md) and routing to the Obsidian vault or maskor
is the same move.

See also the concrete flows: [fast-notes](flows/fast-notes.md),
[voice-notes](flows/voice-notes.md), and the model in
[vision/unified-app.md](vision/unified-app.md).

---

## The ingestion contract (the inbox)

Everything enters as a **capture envelope**: a source-agnostic JSON object wrapping a typed
payload. Memos, a voice recorder, a web-walks walk, and a share-target all produce the same
envelope shape.

| Concern | Standard | Notes |
|---|---|---|
| Envelope design | **ActivityStreams 2.0** vocabulary (as a reading, not a hard dep) | A capture is a `Create` activity over a typed object: id, `published`, actor/source, object. |
| Transport | [Micropub](https://www.w3.org/TR/micropub/)-shaped endpoint over the native JSON envelope | Single endpoint, OAuth2, create/update/delete. Any Micropub-ish client can feed the inbox. Expose it as one adapter; don't let Microformats2 constrain the richer item model. |
| Schema | JSON Schema per payload type | The executable lock: envelope + each payload validated against a shared schema. |

**Hard rule (from the philosophy):** enrichment produces **suggestions attached to the
item, never mutations**. The original capture is immutable; transcript, tags, type guess,
and destination guess are layered beside it.

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
| walk (graph) | [JSON Canvas 1.0](https://jsoncanvas.org) + Web Annotations by node/edge id + Markdown outline (from web-walks) |
| collection | membership (many-to-many item ↔ collection) over any of the above |
| table | CSV (Frictionless Data Package when structure matters) |
| palette / board | typed JSON blob + renderer; boards can serialize as JSON Canvas |

---

## Identity & provenance (the cross-app glue)

- **Identity:** UUIDv7 (time-ordered) for every item/enrichment/collection; content hashes
  for immutable blobs (snapshots, audio); reference across systems with the
  `urn:commons:item:<uuid>` URI namespace ([RFC 8141](https://datatracker.ietf.org/doc/html/rfc8141)).
  A web resource = URL + capture time ([Memento](https://datatracker.ietf.org/doc/html/rfc7089)).
- **Provenance:** the three [W3C PROV](https://www.w3.org/TR/prov-o/) relations, as
  frontmatter keys (not full RDF):
  - `wasDerivedFrom` — processed artifact → original capture
  - `wasGeneratedBy` — enrichment output → the activity/model that produced it
  - `wasAttributedTo` — the agent: a human decision vs. `whisperx-medium` vs. `qwen3-4b`
  - `wasRevisionOf` — a revision → the capture it supersedes. Edits are **appends, not
    mutations**: a new item carrying the original `created` plus an `updated` timestamp,
    linked back to its predecessor ([vision/pool-and-routing.md](vision/pool-and-routing.md#edits-are-revisions-not-mutations)).
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
| Obsidian vault | CommonMark + Obsidian-flavored `[[wikilinks]]` / `![[embeds]]`; walks as `.canvas`; voice as `.md` + audio embed (see [voice-notes.md](flows/voice-notes.md)) |
| maskor | Markdown fragment + frontmatter with weighted-tag **aspects** (`aspects: [{name, weight}]`) — notemap's tag/enrichment layer with weights attached |
| project collection | membership + processed-artifact layer referencing preserved originals |
| other platforms | generic webhook/exporter interface |

One writer per file: only the server-side router touches vault files.

Routing is **non-destructive and append-only**: the capture stays in the feed, and each
delivery appends a `(destination, timestamp, pointer)` record — a list, not a boolean, since
one item may be routed to several destinations. The pointer is best-effort; the destination
is someone else's system, so a stale pointer records where a note *once went* rather than
guaranteeing where it is. Adapters declare which verbs (`create`, `append`, `place`) they
support per payload type. Full model: [vision/pool-and-routing.md](vision/pool-and-routing.md#destinations-and-the-routing-table).

---

## Conformance

- **Roles:** store / router (+ enrichment). **Tier 3** (live ingestion API) — it *is* the
  bus other apps hook into.
- **Enrichment infra** (not a wire standard, recorded for completeness):
  [sqlite-vec](https://github.com/asg017/sqlite-vec) embedding index with a multilingual
  Ollama model (`bge-m3` / `multilingual-e5-small`) — powers destination suggestions and
  cross-system search ([vision/semantic-search.md](vision/semantic-search.md)). Keeps the
  item store and vector index in one file.

---

## Considered, not adopted

- **Full RDF / PROV-O ontology, JSON-LD framing** — adopt the *relation names* and Dublin
  Core *terms*; skip the triple store. Overkill for a personal hub.
- **ActivityPub federation** — the family is one person's tools, not a social network.
- **A dedicated vector DB (Qdrant/Chroma)** — solves a scale a personal vault never reaches;
  sqlite-vec keeps it to one file, one service.
