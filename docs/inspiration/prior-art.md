# Prior art: what already exists (survey 2026-07)

Research findings on existing projects, apps, and workflows that cover — fully or partly — the ideas in [the three flows](../README.md) and the [unified-app vision](../vision/unified-app.md). Purpose: don't reinvent the wheel, and know which existing tools become *components* if the app ever gets built.

The two questions this answers:

1. **Daily flow, today:** which existing tools close the gaps in the current three-flow setup?
2. **Unified app, later:** what already covers parts of the vision, and what remains genuinely uncovered?

## Closest overall matches to the hub vision

### Karakeep (already self-hosted here)

[Karakeep](https://karakeep.app/) ([GitHub](https://github.com/karakeep-app/karakeep), ex-Hoarder) is the closest *existing self-hosted product* to the capture side of the vision: a "bookmark-everything" app — links, text notes, images, PDFs — with Android/iOS quick-save apps and **AI auto-tagging + summarization via Ollama** (enrichment layered onto captures), plus full-text search.

- Covers: capture-anything, local-AI enrichment, mobile capture.
- Missing vs. the vision: no lifecycle/queue-drain ritual (tags are applied, not queued for ratification), no voice pipeline, no routing — Karakeep is an **archive**, not a conveyor belt; items don't *leave* it.
- Implication: the hub could plausibly be built as **glue around Karakeep** rather than from scratch. Its AI tagging should be pointed at the existing Ollama regardless.

### Blinko

[Blinko](https://github.com/blinkospace/blinko) — open-source, self-hosted, Memos-like quick-capture cards with a two-tier model: quick "blinkos" vs. long-term "notes" — a crude version of the capture→promote lifecycle. Ships **AI via Ollama and a pgvector embedding index for semantic search** over notes, i.e. the sqlite-vec part of [semantic-search.md](../vision/semantic-search.md) exists there today. Community framing: "what usememos should have been", open-source Mem.ai alternative ([review](https://noted.lol/blinko/), [Ollama setup](https://www.saltyoldgeek.com/posts/blinko-notes/)).

- Covers: fast capture, tags, semantic search, self-hosted AI — in one container stack (needs PostgreSQL + pgvector).
- Missing: voice pipeline, vault routing; AI is search/RAG-flavored, not advisory-suggestion-flavored. Offline-first capture on Android **needs verifying** (airplane-mode test) before it could replace Memos.
- Watch this project: the one most likely to grow into the vision from the outside.

### Note Companion (ex File Organizer 2000)

[Note Companion](https://github.com/different-ai/file-organizer-2000/blob/master/README.md) ([site](https://www.notecompanion.ai/)) — Obsidian plugin; the closest existing implementation of **advisory enrichment + process step**, living inside Obsidian instead of in front of it. It watches a dedicated **Inbox folder**; for each item it produces AI suggestions for folder, tags, filename, and formatting, which you **accept one-by-one in an "Organizer" panel** (auto-filing is optional — manual mode *is* the advisory-only model). Also transcribes audio dropped into the vault.

- Covers: most of the Phase-1 hub value (suggest-then-ratify over an inbox) with zero backend code.
- Caveats: desktop-only; polished path is their cloud service — self-hosting/own-endpoint mode needs verifying against the privacy rule before use.

### Memex (memex-lab)

[Memex](https://github.com/memex-lab/memex) — GPL-3.0 Flutter app (iOS/Android), actively developed, ~750 commits. An **AI journal**: captures text, photos and voice on the phone, then multi-agent AI turns fragments into typed "cards" (10+ types — task, event, article, person, metric…) organised P.A.R.A.-style, with entity extraction, tags, cross-references and generated insight cards. Storage is local: Drift/SQLite plus markdown files on the device, optional folder or iCloud backup. Bring-your-own LLM across 14+ providers **including Ollama**, prompts going phone → provider directly.

- Covers, and closer than anything else on the capture side: **on-device multimodal capture + local-first storage + local-LLM enrichment + typed heterogeneous fragments** — the card taxonomy is the nearest existing thing to the fragment types in [project-collections.md](../vision/project-collections.md), and markdown export keeps the no-lock-in rule.
- Missing vs. the vision, and the gap is philosophical: **the AI acts rather than suggests.** Cards are generated, not proposed for ratification — the inverse of the advisory-only rule ([standards.md](../standards.md#the-ingestion-contract-the-inbox)). There is no queue, no lifecycle state, no ratification step, and no routing: export is not delivery to a destination, and items are never meant to *leave*. It is a journal, i.e. an archive.
- On-device only means **no server** — no shared pipeline across phone and desktop, no vault writer, no WhisperX-grade transcription on the homelab GPU.
- Most interesting angle: as a **Flutter capture client under a compatible licence**, it is the closest existing starting point for the vision's Phase 2 mobile app — the expensive part per [unified-app.md](../vision/unified-app.md#sketch). Worth re-checking before any mobile work begins.

## The workflow itself has famous prior art

- **[Drafts](https://getdrafts.com/)** (iOS/Mac) — the canonical "capture first, route later" product: every capture lands in an Inbox, processing means firing **actions** that send text to destinations, then archive/trash ([docs](https://docs.getdrafts.com/gettingstarted/)). Apple-only and cloud-synced, so a *design reference* (especially its action/routing model), not a solution.
- **Emacs org-mode: `org-capture` → refile** — the decades-old original of the entire core loop: frictionless capture into an inbox file, deliberate refile ritual into project trees, offline-first plain text (Android via Orgzly + Syncthing). No AI, no audio — but proof the *ritual* works long-term.
- **GTD / PARA / CODE** — the process-the-queue step is inbox-zero discipline; "fleeting notes → inbox → permanent notes" workflows are everywhere on r/PKMS, r/ObsidianMD, zettelkasten.de. The ritual needs no invention, only tooling.

## The DIY pattern that is basically Phase 1

A common r/selfhosted pattern replicates capture→enrich→vault from existing parts: **a chat bot as universal capture surface** (text, voice, images, links — offline queueing handled by the messenger), **n8n as orchestrator, Whisper for transcription, Ollama for tags/summary, markdown written into the vault**:

- Ready-made n8n templates: [Telegram voice → local Whisper → local LLaMA → note with suggested tags](https://n8n.io/workflows/6013-create-personal-notes-with-voice-transcription-using-local-llama-and-telegram/), [Whisper transcription flows](https://n8n.io/workflows/4528-transcribe-voice-messages-from-telegram-using-openai-whisper-1/).
- [Obsidian Telegram Sync plugin](https://www.blog.brightcoding.dev/2025/12/21/the-ultimate-guide-to-obsidian-telegram-sync-transform-your-chaos-into-clarity/) — pipes messages/voice/images straight into the vault.
- Full project: [agent-second-brain](https://github.com/smixs/agent-second-brain) — voice in Telegram → typed, linked notes in the vault.

Catch: Telegram is a third-party cloud — violates the privacy principle for audio. (A self-hosted Matrix bot is the compliant variant of the same trick.) But the **n8n skeleton works with Memos/Speakr as inputs**: it can orchestrate Memos API + Speakr + Ollama + vault-writes with configuration instead of code — the cheapest way to test the pipeline and the ritual before writing a bespoke hub.

## Piece-by-piece coverage

| Idea | Existing coverage | Notes |
|---|---|---|
| Memos → vault promotion | Plugins: [obsidian-memos-sync](https://github.com/RyoJerryYu/obsidian-memos-sync) (broken ≥0.25), [Yet Another Memos Sync](https://github.com/exusiaiwei/yet-another-memos-sync) (maintained but ≤0.25.1, failed on 0.27.1), [Memos AI Sync](https://github.com/leoleelxh/obsidian-memos-ai-sync) (≤0.22.5) — all daily-note-mode only, all chasing Memos API churn | Plugin route abandoned; replaced by own [`scripts/memos-vault-sync/`](../../scripts/memos-vault-sync/README.md) — one-way sync into `inbox/`, lifecycle-aware (delete = processed, edit resurfaces). See [fast-notes.md](../flows/fast-notes.md). |
| Memos-style timeline *inside* Obsidian | [Thino](https://github.com/Quorafind/Obsidian-Thino) (ex Obsidian-Memos) | Would collapse two systems into one — but capture means opening Obsidian mobile: slower than the Memos homescreen quick-note shortcut, and mobile Obsidian must be open for sync. Considered, **rejected for now**: capture speed wins. |
| Voice pipeline | Speakr + WhisperX (chosen); [Scriberr](https://github.com/rishikanthc/Scriberr) | Scriberr has **resumed development** (Parakeet/Canary models, speaker detection) — worth re-checking export support before Phase 1, but Speakr's vault auto-export still decides it. |
| Semantic search in vault | Smart Connections, Khoj (see [semantic-search.md](../vision/semantic-search.md)) | Unchanged. Blinko's pgvector index is a partial overlap on the hub side. |
| Destination suggestion (k-NN → "belongs to project X" with neighbor evidence) | **nothing** | Confirmed still uncovered. |
| Speech-vs-not detection (birdsong ≠ garbled transcript) | **nothing** | Confirmed still uncovered. |
| Pipeline status on phone | **nothing** | Confirmed still uncovered. |
| Project collections ([project-collections.md](../vision/project-collections.md)) | [Anytype](https://aitoolpick.org/blog/anytype-review-2026/) — offline-first, E2E-encrypted, **self-hostable sync**, user-defined object types + relations + collections; SiYuan, AFFiNE (docs + whiteboards + databases, Docker) ([selfh.st overview](https://selfh.st/alternatives/notion/)); Pinry for pure image boards | Anytype is the strongest existing "project as database of heterogeneous typed fragments" — but no capture-inbox pipeline, no preserved-original layer. Cloud apps (myMind, Mem, Sublime) prove demand for "capture anything, AI files it". |

## Verdict

The critical take in [unified-app.md](../vision/unified-app.md) survives contact with the landscape, with two amendments:

1. **The uncovered combination is confirmed**: nothing does offline-first multimodal capture + *advisory-only* enrichment + lifecycle state + queue-drain ritual + pluggable routing into someone else's archive. Everything close is either an archive that keeps your stuff (Karakeep, Blinko, Memex), an in-vault assistant (Note Companion), or cloud (Drafts, Mem, Sublime). Memex is the sharpest illustration of the split: it has the best local-first multimodal capture of the lot and still inverts the core rule by letting the AI file for you.
2. **The build-vs-assemble line has moved.** Before writing the hub: (a) try **suggest-then-ratify inside Obsidian** (Note Companion over `inbox/`) — most of the Phase-1 value; (b) if orchestration is still missing, try an **n8n skeleton** over Memos + Speakr + Ollama. Only if the ritual proves out *and* the assembled version still grates does the bespoke hub earn its keep. See [action-plan.md](../action-plan.md).
