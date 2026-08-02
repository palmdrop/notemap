# Fast manual notes

Quick, low-friction text capture on the phone: thoughts, observations, links, todos. Timestamped timeline, inline tags, works fully offline.

## Why this flow

- Capturing a thought must take **seconds** — open app, type, done.
- I like the **timestamped timeline** look and the fast gestures of Memos.
- Must work **offline** (travel) and sync to my **self-hosted** server when back online.
- These notes are allowed to be messy. Refinement happens later, elsewhere.

## The flow

### Capture (anywhere, online or offline)

1. Open **Moe Memos** on the phone.
2. Type the note. Tag inline with `#tags` (e.g. `#trip`, `#idea`, `#readlater`).
3. Save. The note is timestamped and appears in the timeline immediately.

Offline behavior: Moe Memos is offline-first since v2.0.3 — notes are stored locally and pushed to the Memos server automatically when connectivity returns. Nothing about the capture gesture changes when offline.

### Processing later

Memos is the stream; the Obsidian vault is the archive of refined material. The bridge is a **manual review ritual**, not automation:

1. Periodically (weekly at home; after each leg of a trip), skim the Memos timeline from the last review point.
2. For each note, decide:
   - **Promote** — it belongs to a project or is worth keeping long-term → rewrite/expand it into the appropriate vault note (this deliberate rewriting is a feature, not overhead).
   - **Act** — it's a todo → do it or move it to wherever tasks live.
   - **Leave** — ephemeral, but harmless → stays in the Memos timeline as a journal of record.
3. Tags to skim by: `#idea` and project tags first, `#readlater` in idle moments.

Notes are generally *not deleted* from Memos after promotion — the timeline doubles as a lightweight journal, and its value is the unedited timestamped record.

### Reducing promotion friction (decided 2026-07)

**Decision: Memos stays as the capture surface; a small server-side script — `scripts/memos-vault-sync/` — bridges memos into the vault as inbox items.** One file per memo in `inbox/`; deleting/moving the file in Obsidian = processed (never re-synced); a memo edited server-side after sync resurfaces with a visible ✏️ edited marker; user-modified files are never overwritten. Runs as a systemd timer on the server — only the server writes vault files, per the one-writer principle in [unified-app.md](../vision/unified-app.md).

The plugin route was tried first and failed on Memos 0.27.1: [obsidian-memos-sync](https://github.com/RyoJerryYu/obsidian-memos-sync) is broken on servers ≥0.25 ([open issue](https://github.com/RyoJerryYu/obsidian-memos-sync/issues/52)), [Yet Another Memos Sync](https://github.com/exusiaiwei/yet-another-memos-sync) (maintained, ≤0.25.1) also failed in practice, and the remaining plugins are stale (≤0.22.5). All of them are daily-note-mode only anyway — no configurable file layout — and every plugin inherits the Memos-API-churn treadmill. The script fixes both.

### Processing the inbox (in Obsidian)

Memos land as one file per memo in `inbox/`; processing is the linear drain-to-zero ritual above, done in the vault. Obsidian has core commands to *dispose* of the current file ("Delete current file", "Move current file to another folder") but no "next file in folder" — that gap is the friction. The lightweight fix is a keyboard loop: install **[Quick Explorer](https://github.com/pjeby/quick-explorer)** for its "Go to next file in folder" command, then bind hotkeys for next-file, move-to-folder, and delete. Filenames are timestamped, so sorting by name is chronological; open the top note, and one keystroke per item promotes (move to a project folder — files it *and* clears the inbox), trashes, or skips. The [Flow](https://www.obsidianstats.com/plugins/flow) plugin is a heavier GTD alternative with a guided inbox-processing mode if the keyboard loop feels too manual.

This is a trial, not a settled setup — it's the [vision's](../vision/unified-app.md) riskiest assumption (whether the review ritual actually gets done). If a good keyboard loop still doesn't stick, that's evidence the one-file-per-memo granularity is wrong.

### Alternatives considered

- **Thino** (Memos-style timeline as an Obsidian plugin) would collapse Memos + vault into one system — rejected for now. One-tap capture is *approximable*: Obsidian mobile 1.11 (2026-01) has official homescreen widgets ("Create a note" / "Open daily note", full app launch), and community widgets can append to the daily note **without opening Obsidian** ([forum widget](https://forum.obsidian.md/t/i-built-a-android-home-screen-widget-for-obsidian-view-notes-tick-off-tasks-and-quick-capture-without-opening-the-app/112819), [Automate flow](https://zachyoung.dev/posts/obsidian-quick-capture-for-android)) — Thino parses timestamped daily-note entries as thinos. But that puts every capture on **two-way file sync** (FolderSync races on the daily note, desktop edits the same file) — exactly the fragile transport [unified-app.md](../vision/unified-app.md) wants out of the capture path, while Memos capture rides API sync. Also: Thino ≥2.0 is closed-source freemium (data stays plain markdown, so lock-in is mild). Revisit only if the two-system setup starts feeling redundant *and* the sync-conflict risk is acceptable.
- **Blinko** (self-hosted, Memos-like + Ollama AI + semantic search) is a candidate Memos *replacement* with adoption criteria (offline capture test, capture-speed parity, migration) in [../action-plan.md](../action-plan.md), Approach C.

## Suggested setup

| Component | Choice | Notes |
|---|---|---|
| Server | [Memos](https://usememos.com/) (Docker) | Already running. |
| Android client | [Moe Memos](https://memos.moe/) ≥ 2.0.3 | Play Store or F-Droid. Offline-first with auto-sync. |

### Compatibility caveat

Moe Memos officially supports Memos server **0.21.0** and **0.26.0–0.26.2**. For newer server versions, the Moe Memos FAQ recommends the **Mortis** API-conversion proxy. Before any trip: check the server version, and test capture + sync in airplane mode once.

### Pre-trip checklist

- [ ] Moe Memos logged in against the server, recent sync confirmed.
- [ ] Airplane-mode test: create a note offline, go online, confirm it appears on the server.
- [ ] Memos server version still within Moe Memos' supported range (pin the server version; don't auto-upgrade right before traveling).
