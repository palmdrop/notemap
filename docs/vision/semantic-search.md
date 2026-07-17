# Semantic search & note proximity

Research notes (2026-07) on vector embeddings for two use cases:

1. **Smart search** — find notes by meaning, not keywords. The main purpose.
2. **Proximity suggestions** — a queue item is "close" to the notes of a certain project → suggest that project as its destination during [queue processing](unified-app.md#the-core-loop-capture--enrich--process).

Scope: connections, suggestions, and search only. **Not interested in AI chat / RAG chat over the vault** — plugins are evaluated with their chat features ignored.

## In-vault search: already solved, don't build it

Semantic search *inside Obsidian* is mature plugin territory:

| Plugin | What it does | Fit |
|---|---|---|
| [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) | Related-notes sidebar + semantic search. Local embedding model by default (zero setup, no API key); can point at Ollama. Works on mobile. | **Trying this now.** De-facto standard, no server dependency. |
| [Vector Search](https://github.com/ashwin271/obsidian-vector-search) | Minimal: Ollama + `nomic-embed-text`, similarity threshold, "find similar notes". | Fallback if Smart Connections feels heavy. Less maintained. |
| [Khoj](https://github.com/khoj-ai/khoj) | **Self-hosted server** that indexes the vault; Obsidian plugin is a thin client. | Interesting *architecturally* — see below. As a product it's a full second-brain app (chat, agents, automations), heavier than needed and overlaps with the hub. |
| Copilot for Obsidian | RAG chat over the vault. | Out of scope — chat. |

### Decision: try Smart Connections

- Zero build; validates whether semantic search over *my* notes is actually useful before anything gets built.
- Desktop first. The index is **per-device**; skipping it on the phone fits the "phone is mostly a reader" model.
- Sync hygiene: it stores its index in `.smart-env/` — **add to FolderSync exclusions** alongside `.obsidian/` (see [obsidian.md](../flows/obsidian.md#foldersync-tuning-battery--reliability)).
- **Privacy:** local by default — embeddings run on-device (built-in BGE-micro; can point at own Ollama), index stays in the vault, no API key. Notes only reach a cloud provider if one is explicitly configured (chat/Pro features — not used). Setup checklist: enter no API keys, disable any telemetry toggle if present, then verify with the airplane-mode test — related notes + search must work fully offline. Only expected network call: the one-time model download.

## Proximity suggestions: the uncovered part

No plugin does "this queue item belongs to project X" — plugins have no queue concept. This belongs in the **hub's enrichment step** (it's the "guessed destination" already listed in [unified-app.md](unified-app.md)). The mechanics are simple and well-understood:

1. **Index the vault server-side**: embed each note (or chunk), tagged with its folder/project. The folder structure provides labels for free — no training, no classifier.
2. **Embed each queue item** — memo text, or the transcript for voice notes (side effect: audio becomes searchable and routable).
3. **k-nearest-neighbors → suggestion**: look at where the top-k most similar vault notes live. If 8 of 10 are under `projects/foo/`, suggest `foo` with high confidence; if neighbors scatter, suggest nothing. Simpler and more honest than per-project centroids.
4. Optional hybrid: embeddings retrieve candidates, the small Ollama model picks/justifies among them. Probably unnecessary for "which project" — plain similarity is deterministic and instant.

This fits the **advisory-only rule** better than LLM guesses: a similarity score with "nearest existing notes" as evidence is inspectable ("similar to these 3 notes in `projects/synth/`"), wrong sometimes, never acting on its own.

The hub-side index also enables the one thing no Obsidian plugin can do: **cross-system search** — one query spanning the Memos timeline, voice transcripts, and the vault.

### What to borrow from Khoj

Khoj proves the pattern the hub needs — server-side vault indexing with incremental re-index on file changes, thin clients — but bundles it inside a second-brain app. Borrow the architecture (or its indexing code), not the product.

## Hardware & infrastructure fit

- **Embedding models are nearly free.** `nomic-embed-text` is ~270 MB and runs fine on CPU — it never competes with WhisperX or the formatting LLM for the 6 GB of VRAM. Embedding can run anytime, not just when the GPU is idle.
- **Multilingual caveat:** notes mix Swedish and English, and cross-language similarity (Swedish memo → English-titled project notes) is exactly the routing case. `nomic-embed-text` is English-centric — prefer a multilingual model via Ollama: **`bge-m3`** or **`multilingual-e5-small`**. Test cross-language matching early; it decides the model choice.
- **No vector database needed.** A personal vault is thousands of notes, not millions of vectors; brute-force cosine similarity over that is milliseconds. Pragmatic choice: **[sqlite-vec](https://github.com/asg017/sqlite-vec)** — an SQLite extension, so the hub's item store and vector index are one file, no extra container. Qdrant/Chroma solve a different scale and would just be another service on the laptop.

## Plan

1. **Now:** Smart Connections in desktop Obsidian; exclude `.smart-env/` from FolderSync. Evaluate on real notes.
2. **Phase 1 (hub):** server-side embedding index (sqlite-vec + multilingual Ollama embedding model) powering (a) destination suggestions during enrichment and (b) cross-system search. Vault search stays in Obsidian via plugins — search-where-you-read beats search-in-another-tab; the hub should not grow a vault-search UI early.
