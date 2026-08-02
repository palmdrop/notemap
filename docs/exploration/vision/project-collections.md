# Vision: project collections — the project as a database

Direction note (2026-07), long-term — recorded so the capability isn't forgotten, and so the architecture doesn't accidentally close the door on it. **The core of the app is unchanged**: the processing queue and second-brain integrations (Obsidian first, possibly others, possibly an own-built system someday). The app stays general; this flow — collection/research/moodboard gathering — is one use of it, alongside plain note taking.

**Update (2026-07): where collected material lives is no longer an open question — it is not notemap's question.** A collection is always a **destination**, reached through a routing adapter: an Obsidian folder, a single markdown file, an Are.na-like board, a future standalone app. notemap owns the feed, classification, enrichment, and the routing log; it does not own collections, prose, or arrangement. See [pool-and-routing.md](pool-and-routing.md#collections-are-destinations). The consequence is that the collection's home can change — or be several homes at once — without touching the pool.

## The idea

Beyond capture-and-route ([unified-app.md](unified-app.md)), there's a second thing I want: **cohesive collections** — gathering material for a project, where a piece of material can be *literally anything*. A link, a quote, a song, a few words, a color palette, a canvas board, a table of data. Anything that can be created or found and relates to the project — conceptually, aesthetically, or directly.

Think of it as a **project database**: a body of raw and processed material that the user collects, processes, arranges, and stores. The project isn't (only) a folder of prose notes; it's a curated database of heterogeneous fragments, and the creative work grows out of arranging them.

The inspiration is [the database novel](https://subtxt.in/thoughts/2014/03/30/database-novel) — Perec structuring *Life: A User's Manual* from systematic lists of objects, activities, emotions, then writing from that structured foundation. Fragments first, composition second; the data structure *precedes* the work rather than decorating it. Here the same move applies to vaguer things than a novel: a music project, a generative-art series, an essay, a mood, a place. The collection is the substrate the work condenses out of.

So this is note-taking **and creative software**, and it's fine for it to be opinionated toward creative projects. Primary framing: a reference and idea collection tool — though nothing stops it being used for any kind of note taking.

## The rule: originals are preserved by default — but the user owns the data

Each collected artifact exists in (at least) two layers:

1. **The original capture** — the unprocessed piece of recorded info, exactly as it entered: the pasted URL and a snapshot of what it pointed to, the raw voice recording, the verbatim quote, the image as saved. Preserved by default; it should always be possible to look back at what was actually captured, before any processing.
2. **The processed artifact** — what the user made of it: cropped, annotated, retitled, excerpted, arranged on a board, merged with other fragments. This is the working layer, freely editable. "Editing" a capture normally means *this*: creating the note/artifact **from** the original, not mutating the original.

This extends the advisory-only enrichment rule in [unified-app.md](unified-app.md) ("suggestions beside the capture, never mutations") past the processing step: by default, not even the user's own processing touches the original. Provenance is a first-class feature — every processed artifact links back to its capture(s).

But preservation is a **default, not a lock** — data ownership outranks it. The user can always:

- **Delete** an original (accidental recordings happen); and
- **Edit** an original directly if they really want to — the consequence is simply that automatic processes (transcription, suggestions, embeddings) **re-run against the edited capture**, since the enrichment attached to the old content no longer applies. Editing an original that hasn't been manually processed yet is entirely unremarkable — it's just fixing the capture before triage.

Details (versioning? keep the pre-edit original around? how re-processing interacts with an already-routed item?) are deliberately left for later — this section records the stance, not a spec.

## Prior art, and why note it anyway

| App | What it covers | Where it falls short for me |
|---|---|---|
| [Are.na](https://www.are.na) | The canonical version: blocks (any media) in channels, cross-connections, visual grid. Community-driven. | Cloud-only, social by design. No self-hosting, no offline capture, no provenance layer. |
| [Sublime](https://sublime.app) | Cards + collections, capture-now-organize-later, annotation on cards, AI-surfaced related ideas, canvas for going "from curation to creation." | Closest in spirit (including the curation→creation arc). Cloud, proprietary, AI reads your library server-side. |
| Notion | Databases of anything, arbitrary properties, galleries. | Generic workspace, heavy, cloud; a project database is *possible* but nothing about it is opinionated toward creative collecting. |
| Obsidian + plugins (Bases, canvas, embeds) | Might honestly be sufficient: a project folder with embedded images/audio, canvas boards, dataview/Bases tables. | Everything is a file the user edits in place — there's no preserved-original layer, no capture inbox feeding collections, and non-text artifacts (palettes, tables, boards) are second-class. |
| [Anytype](https://anytype.io) | Offline-first, E2E-encrypted, self-hostable sync; user-defined object types with relations and collections — the strongest existing "project as a database of heterogeneous typed fragments." | No capture-inbox pipeline, no preserved-original/provenance layer; its own storage format, not plain vault files. See [../inspiration/prior-art.md](../inspiration/prior-art.md). |

These apps prove the demand; none combines **self-hosted + offline-first capture + preserved originals + collections as the organizing unit**. That combination is exactly the hub's territory. Whether that justifies building anything is an open question — Obsidian may cover 80% — but the direction is worth recording *now* because it changes what the hub's data model should allow later.

## How it fits the existing vision

This changes nothing about the core loop — capture → enrich → process, with the queue draining into destinations. It adds one candidate destination: a **project collection**, alongside "vault" and "other platform." Which *shape* a collection takes stays open — some captures just don't want to become markdown in a folder — but the mechanism doesn't: it's an adapter behind the routing table in [pool-and-routing.md](pool-and-routing.md#destinations-and-the-routing-table), same as any other sink.

One consequence of the settled model is worth noting here: **captures never merge with each other.** Merging and appending happen from a capture *into* an entity in the destination — a notemap note into an Obsidian document — never between two queue items. The processed-artifact layer therefore lives on the destination side, and what notemap keeps is the original capture plus a best-effort pointer to where it went.

Concretely, what's cheap to honor early and expensive to retrofit, whatever the eventual home:

- **The item store already has the right bones.** Captures are immutable, enrichment is layered beside them, items carry lifecycle state. Collections add: a `collection` entity, membership (item ↔ collection, many-to-many — one artifact can serve several projects), and a *processed-artifact* layer that references original captures instead of replacing them.
- **Artifact types must stay open-ended.** The capture model shouldn't assume text/audio/link. A color palette, a table, a board arrangement are all just typed payloads + renderers. Design the item payload as (type, blob/JSON, metadata) from the start.
- **The [semantic-search](semantic-search.md) proximity machinery is the same feature.** "This queue item is close to the notes of project X" generalizes to "close to the *collection* of project X" — embedding neighbors drawn from a project's collected fragments, not just its vault folder. Collections make the destination-suggestion evidence richer, not different.
- **Arrangement is a later, separate concern.** Boards/canvas/ordering (the Sublime "canvas," the Are.na grid, Perec's lists-into-chapters) is UI on top of membership. The database comes first; arrangement views can wait indefinitely.

## What this is not

- Not a change to the core: the processing queue and second-brain integrations remain the center of gravity.
- Not a commitment to build a canvas app, an Are.na clone, or any UI — this note is about the *data model* direction.
- Not a replacement for the vault. Long-form refined writing still lives in Obsidian; a collection references and coexists with vault notes rather than absorbing them.
- Not social. Are.na's connective tissue is other people; here it's one person's projects.
