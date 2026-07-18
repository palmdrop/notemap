# Action plan: try existing tools first, build only if they fail

Decision rule: **run the assembled flows for a few weeks (including at least one trip). If the daily flow feels sufficient, the unified app is unnecessary. If specific frictions survive, they become the app's requirements list.** See [inspiration/prior-art.md](inspiration/prior-art.md) for the research behind this.

Approaches ordered by how little new self-hosting they need. A and B stack; C and D are alternatives to evaluate, not commitments.

## Approach A — bridge the current stack (no new services) — **CHOSEN, starting now (2026-07)**

The baseline: keep Memos (the homescreen quick-note shortcut stays), keep the planned voice pipeline, add the missing bridges.

1. **Install [obsidian-memos-sync](https://github.com/RyoJerryYu/obsidian-memos-sync)** (desktop Obsidian) — *decided; first step*. Memos land in daily notes / a sync folder in the vault → promotion becomes moving text *within* the vault instead of cross-app copy-paste. Check version compatibility against the pinned Memos server first.
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

## Not doing (decided)

- **Thino instead of Memos** — capture would mean opening Obsidian mobile; the Memos homescreen quick-note shortcut is faster, and stream/archive separation is deliberate. Revisit only if memos-sync makes the two-system setup feel redundant anyway.
- **Telegram-bot capture** — third-party cloud in the capture path violates the privacy principle (audio especially). Matrix-bot variant noted in [prior-art.md](inspiration/prior-art.md) if a chat-capture surface is ever wanted.

## Review checkpoint

After ~3–4 weeks on A (+B), answer:

1. Did the inbox actually drain regularly? (If not, no app will fix that.)
2. Which frictions survived? Map each to the gap table in [unified-app.md](vision/unified-app.md) — whatever remains is the real requirements list for Phase 1.
3. Did Blinko (if tried) remove more services than it added?
