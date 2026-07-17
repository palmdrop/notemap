# Obsidian integration

Deliberate note-taking: research projects, longer writing, linked notes. The vault is the long-term home for refined material — including promoted fast notes ([fast-notes.md](fast-notes.md)) and voice transcripts ([voice-notes.md](voice-notes.md)).

## Why this flow

- Obsidian for anything with structure: projects, research, linking, longer texts.
- The vault must be available on **desktop and phone**, synced through **my own server** (Nextcloud).
- Mobile is mostly for *reading and small edits*; heavy writing happens on desktop. Fast mobile capture is Memos' job, not Obsidian's.

## The flow

1. Desktop: work in the vault as usual; the Nextcloud desktop client keeps it synced continuously.
2. Phone: FolderSync mirrors the vault between the phone's local storage and Nextcloud (WebDAV) on a schedule. Obsidian mobile opens the local copy — so reading and editing works fully offline.
3. Changes made on the phone reach the server (and then desktop) at the next scheduled sync, or via a manual "sync now" when it matters.

The mental model: **the phone is eventually consistent**. Don't edit the same note on phone and desktop within the same sync window.

## Suggested setup

| Component | Choice | Notes |
|---|---|---|
| Server | Nextcloud (existing) | Vault lives in a Nextcloud folder. |
| Desktop sync | Nextcloud desktop client | Continuous. |
| Phone sync | **FolderSync** (existing) | Two-way sync over WebDAV, *scheduled* — see tuning below. |

### FolderSync tuning (battery + reliability)

The known pain points are battery drain from background operation and unreliable two-way sync. Mitigations:

- **Scheduled sync, not instant sync.** An interval of 1–2 h is enough for a phone that is mostly a reader. Disable any "monitor filesystem" / instant-sync option — that's the battery eater.
- **Sync conditions:** Wi-Fi only (or Wi-Fi + charging). On the road, trigger a manual sync when on hotel/café Wi-Fi instead.
- **Conflict handling:** set conflict resolution to *keep both files* (never "overwrite oldest" silently). A `(conflict)` copy is annoying; a silently lost edit is worse.
- **Exclude `.obsidian/`** (or at least `.obsidian/workspace*` and plugin caches) from sync. Workspace state changes constantly, causes most conflicts, and desktop/mobile configs diverge anyway. Sync note content and attachments only.

### Vault conventions relevant to sync

- `voice/` — voice recordings + their transcript notes (see [voice-notes.md](voice-notes.md)). FolderSync must include this folder.
- `inbox/` — landing zone for promoted fast notes and anything unsorted; processed on desktop.

## Known limitations / revisit later

FolderSync + WebDAV is the *keep-what-works* choice, not the endgame. If sync conflicts or battery become painful again, the researched alternatives, in order of preference:

1. **Syncthing-Fork** — filesystem-level P2P sync with per-folder run conditions (Wi-Fi/charging/interval); the old battery issues are fixed. Drop-in replacement for FolderSync, no server change.
2. **Remotely Save plugin** — syncs from *inside* Obsidian via Nextcloud WebDAV; zero background apps. But it only syncs while Obsidian is open, and the `voice/` folder (written by Fossify, not Obsidian) would still need a file-level sync tool.
3. **Self-hosted LiveSync plugin + CouchDB** — near-real-time and the most reliable on Android, at the cost of one more server component; same `voice/` caveat as above.
