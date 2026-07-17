# Note flows

Documentation of my note-taking flows and the self-hosted setup behind them.

Guiding principles:

- **Self-hosted** — all data lives on my own server. No third-party cloud services.
- **Offline-first** — capture must work without internet (travel). Sync happens when connectivity returns.
- **Fast capture, deliberate processing** — getting a thought down should take seconds; organizing and refining happens later, on my terms.
- **Privacy** — audio and text never leave infrastructure I control. Transcription and LLM processing run on my own hardware.

## The three flows

| Flow | Doc | Capture tool | Home |
|---|---|---|---|
| Fast manual notes | [flows/fast-notes.md](flows/fast-notes.md) | Moe Memos (Android) | Memos server |
| Deliberate notes & research | [flows/obsidian.md](flows/obsidian.md) | Obsidian (Android/desktop) | Obsidian vault via Nextcloud |
| Voice notes | [flows/voice-notes.md](flows/voice-notes.md) | Fossify Voice Recorder | Vault (`voice/` folder) + Speakr |

How they relate:

```mermaid
flowchart LR
    subgraph phone [Phone]
        moe[Moe Memos]
        fossify[Fossify Recorder]
        obsmobile[Obsidian mobile]
    end
    subgraph server [Server]
        memos[Memos server]
        nextcloud[Nextcloud]
        speakr[Speakr + WhisperX + Ollama]
    end
    vault[(Obsidian vault)]

    moe -->|auto-sync when online| memos
    fossify -->|FolderSync| nextcloud
    obsmobile <-->|FolderSync| nextcloud
    nextcloud --- vault
    nextcloud -->|copy new audio| speakr
    speakr -->|export transcript .md| nextcloud
    memos -.->|manual review: promote keepers| vault
```

Longer-term, these flows might converge into a single self-hostable app — see [vision/unified-app.md](vision/unified-app.md) for the gaps such an app would fill and a critical take on whether it's worth building.

Fast notes and the vault are deliberately **separate systems**: Memos is the timestamped stream of ephemeral thoughts, the vault is where refined, long-lived material ends up. The bridge between them is a manual review ritual, not automation (see [fast-notes.md](flows/fast-notes.md#processing-later)).
