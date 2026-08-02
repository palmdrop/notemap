# Action plan: try existing tools first, build only if they fail

Decision rule: **run the assembled flows for a few weeks (including at least one trip). If the daily flow feels sufficient, the unified app is unnecessary. If specific frictions survive, they become the app's requirements list.** See [inspiration/prior-art.md](inspiration/prior-art.md) for the research behind this.

Approaches ordered by how little new self-hosting they need. A, B and E stack; C and D are alternatives to evaluate, not commitments.

## Approach A — bridge the current stack (no new services) — **CHOSEN, starting now (2026-07)**

The baseline: keep Memos (the homescreen quick-note shortcut stays), keep the planned voice pipeline, add the missing bridges.

1. **Memos → vault inbox via `scripts/memos-vault-sync/`** — *decided; first step*. (Plugin route tried and failed on Memos 0.27.1 — see [flows/fast-notes.md](flows/fast-notes.md).) One file per memo in `inbox/`, delete/move = processed, server-side edits resurface with a marker. Deploy as systemd timer; remember the Nextcloud-visibility caveat (`occ files:scan` / External Storage) shared with the Speakr export.
2. **Point Karakeep's AI tagging at the existing Ollama** (it's already running) — read-later/bookmark captures get local-AI enrichment for free.
3. **Smart Connections** in desktop Obsidian (already planned — [semantic-search.md](vision/semantic-search.md)); exclude `.smart-env/` from FolderSync.
4. **Phase-0 voice glue as planned** ([voice-notes.md](flows/voice-notes.md)): FolderSync + copy script + Speakr auto-export.

Cost: two plugins, one config change, the already-planned glue script.

## Approach B — test the advisory ritual inside Obsidian (one plugin)

On top of A: route everything unsorted (memos-sync output, voice transcripts, stray captures) into `inbox/`, and try **[Note Companion](https://github.com/different-ai/file-organizer-2000/blob/master/README.md)** in *manual* mode: it suggests folder/tags/title per inbox item, you ratify in its Organizer panel. This is the Phase-1 hub's suggest-then-ratify loop with zero backend code.

**Precondition:** verify its self-hosted / own-endpoint mode actually keeps note content on own infrastructure (the polished path is their cloud). If it can't run against local Ollama-compatible endpoints without leaking content, skip — the privacy rule outranks the experiment.

What this tests: the riskiest assumption of the whole vision — whether the batched accept/adjust/route ritual actually gets done.

## Approach C — evaluate Blinko as a Memos replacement (one new service)

Spin up [Blinko](https://github.com/blinkospace/blinko) (Docker; needs PostgreSQL + pgvector) alongside Memos and compare for a week. It adds two-tier notes (quick capture vs. long-term), Ollama-backed AI, and built-in semantic search.

Adopt **only if** it passes:
- [ ] Airplane-mode test: capture offline on Android, sync later, nothing lost.
- [ ] Capture speed: a homescreen shortcut/widget as fast as the Memos quick-note shortcut.
- [ ] Migration: existing Memos import works.

If it fails any of these, stay on Memos — Blinko remains the project to watch.

## Approach D — n8n orchestration skeleton (only if A–B leave gaps)

If the ritual works but the missing piece is *orchestration* (enrichment suggestions on memos, cross-system glue), stand up n8n and wire: Memos API → Ollama (suggested tags/type as a comment or tag on the memo) → optional vault writes; Speakr webhooks likewise. This is Phase 1 of [unified-app.md](vision/unified-app.md) as configuration instead of code — and its failure modes tell you exactly what the bespoke hub must do better.

## Approach E — test hyper-collections in Obsidian (no new services)

On top of A: use the vault as the **destination** for creative material and see whether the
model in [vision/pool-and-routing.md](vision/pool-and-routing.md) survives real use. Zero new
services; the point is to find out which parts of that model Obsidian already gives away for
free and which frictions are real requirements.

Target use cases: fragmented journaling, auto-fiction, evergreen fiction, moodboards —
material that accumulates for months or years before it finds its place.

### The two layers already exist

Worth stating before adding anything: **Memos is already the immutable feed, and the vault is
already the working layer.** [fast-notes.md](flows/fast-notes.md#processing-later) never deletes
a memo after promotion, so the preserved-original rule holds today by accident. That is what
makes destructive-looking vault operations safe below — merging an `inbox/` file into a project
note deletes only a *copy*.

### Folder conventions

One inbox (a single pool), tags applied at capture or during a classification pass, files moved
into the destination on routing:

```
inbox/                     # the queue — memos-vault-sync output + voice transcripts
  archive/                 # archived: hidden from the queue, never deleted
projects/<slug>/
  _index.md                # the spine: what this is + a curated, ordered list of fragments
  fragments/               # routed text, one file per fragment
  refs/                    # stub notes for non-text (songs, videos, images, links)
  <slug>.canvas            # arrangement, when it earns its keep
commonplace.md             # single-file destination — the append-file adapter, tested by hand
```

- **`_index.md` is the test of "project as database"** — Perec's list, maintained by hand at
  first. If keeping it current feels like bookkeeping rather than composition, that is a finding.
- **`refs/` stub notes** are the cheap bridge for heterogeneous material: a few lines of
  frontmatter (`kind: song`, url, embed) plus *why it's here*. Makes non-text linkable,
  taggable and queryable without any non-text support. If stubs feel second-class in practice,
  that is the argument for a real collection app.
- **`commonplace.md` must be tested.** It is the minimum viable destination, and if routing only
  ever works against a folder of files, the adapter interface isn't real.
- **`inbox/archive/`** stands in for the archive tab. Moving a file there = archived. No
  auto-archive exists in this setup; note whether you want one and after how long.

### Plugins

| Plugin | Type | Role in the test |
|---|---|---|
| **Note Composer** | core (enable it) | *The* merge primitive: "Merge current file with another file" appends an inbox item into an existing project note; "Extract current selection" splits one. Tests the `append` routing verb. |
| **Quick Explorer** | community | "Go to next file in folder" — the linear queue. Already planned in [fast-notes.md](flows/fast-notes.md#processing-the-inbox-in-obsidian). |
| **Canvas** | core | Arrangement, deliberately last. Only touch it once a project has enough fragments to arrange. |
| **Bases** (or **Dataview**) | core / community | The database view over `projects/<slug>/` — membership, kinds, dates. Tests whether a collection reads as a database or just a folder. |
| **Random Note** | core | Re-encounter with your own material. The feed's retrieval story, standing in for semantic proximity. |
| **Smart Connections** | community (already in A) | Which existing note a fragment is nearest to — the manual version of merge-target suggestion. |
| **Templater** or **QuickAdd** | community | One command to create a `refs/` stub with its frontmatter. Only add it if writing stubs by hand is what stops you writing them. |

Hotkeys worth binding as one loop: next file → merge into note → move to folder → delete.
That sequence *is* the processing ritual; if it doesn't fit under the fingers, nothing else matters.

### Routing rules, tested by hand first

There is no rule engine in the vault, and that is fine — the manual equivalent is: tag in Memos
(`#fictionidea1`), the tag arrives in the synced inbox file, you move the file to the matching
folder. Run it manually for the trial and write down the mapping that emerges.

**Only if a mapping proves stable** should `scripts/memos-vault-sync/`
grow a tag→folder table — and even then as *pre-filing for classification*, not delivery.
Auto-routing at sync time would skip the queue entirely, which is the one thing the model
forbids: rules propose, the user confirms
([pool-and-routing.md](vision/pool-and-routing.md#destinations-and-the-routing-table)).

### What this is actually testing

Each question maps to a decision in the model; the answers are the requirements list.

- Did **linear chronological** processing hold, or did you immediately sort and filter?
- Was **stateless skip** enough, or did you want snooze / "keep, deliberately unrouted"?
- Did you want **auto-archive**, and after how long?
- How often was the verb **append into an existing note** rather than create a new one? Often
  enough to need a suggested target?
- Did **`refs/` stubs** feel like first-class members of the collection, or like apologies?
- Did any note need to go to **two destinations**? (Decides whether fan-out is theoretical.)
- Did you ever want to know **where a note went** after routing? (Decides whether routing
  records earn their keep.)
- Did `_index.md` stay alive, or did the collection decay into an unordered folder?

## Not doing (decided)

- **Thino instead of Memos** — capture would mean opening Obsidian mobile; the Memos homescreen quick-note shortcut is faster, and stream/archive separation is deliberate. Revisit only if memos-sync makes the two-system setup feel redundant anyway.
- **Telegram-bot capture** — third-party cloud in the capture path violates the privacy principle (audio especially). Matrix-bot variant noted in [prior-art.md](inspiration/prior-art.md) if a chat-capture surface is ever wanted.

## Review checkpoint

After ~3–4 weeks on A (+B), answer:

1. Did the inbox actually drain regularly? (If not, no app will fix that.)
2. Which frictions survived? Map each to the gap table in [unified-app.md](vision/unified-app.md) — whatever remains is the real requirements list for Phase 1.
3. Did Blinko (if tried) remove more services than it added?
4. From E: which parts of [pool-and-routing.md](vision/pool-and-routing.md) did Obsidian give away for free, and which needed a workaround? A workaround that stuck is a feature; one that was abandoned after a week is a feature that was never needed.
