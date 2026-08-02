# Vision: audio into the pool, and enrichment as a provider interface

How a voice recording becomes a note in notemap (2026-07), and why transcription must be a
**configurable provider** rather than a hardwired component. The second half generalises past
audio: every enrichment step — transcription, formatting, tagging, embeddings — is a provider
behind an adapter, which is what makes the software deployable by someone whose homelab isn't
this homelab.

Companion to [pool-and-routing.md](pool-and-routing.md): that doc covers what leaves notemap,
this one covers what enters it and what is done to it on the way in.

## Today's flow is a pipeline, not an intake

[voice-notes.md](../flows/voice-notes.md) describes the Phase 0 path: Fossify records into the
vault's `voice/`, FolderSync uploads it, a copy script feeds Speakr, Speakr transcribes and
auto-exports a `.md` beside the audio. It works, and it stays as Phase 0 — but it bypasses
notemap in a way that matters:

- **The audio never becomes a pool item.** No capture envelope, no queue entry, no
  classification, no routing decision, no lifecycle state.
- **The destination is decided at record time.** The transcript lands in `vault/voice/` because
  that is where the script points, not because anyone chose it — the capture is *pre-routed*,
  which is exactly what [unified-app.md](unified-app.md#the-core-loop-capture--enrich--process)
  says capture must never require.
- **Speakr is the pipeline**, not a component behind an interface.

## Three intake paths, one envelope

All three produce the same capture envelope
([standards.md](../../standards.md#the-ingestion-contract-the-inbox)): audio blob plus metadata.
Nothing downstream knows or cares which path an item arrived by.

| Path | For | Notes |
|---|---|---|
| **Share-target from any recorder** | the primary path | Record in Fossify or whatever else; share to notemap. Keeps recorder choice free and costs almost nothing to build — already the stated design in [unified-app.md](unified-app.md#sketch). |
| **Built-in recorder** in the notemap app | one-tap capture while walking | Deliberately minimal: record → stop → it is in the pool. No trimming, no waveform, no editing. The moment it grows an editor it is rebuilding a recorder app, and [unified-app.md](unified-app.md#the-genuine-gaps-my-critical-take) already warns where that ends. |
| **Folder watch** (server-side) | today's Fossify→FolderSync path, and bulk import of an existing archive | The Phase 0 copy script, re-pointed at notemap's intake instead of Speakr's watch folder. |

### Two traps, both easy to get wrong

- **Capture time is the recording time**, never import, sync, or share time. A folder watch
  picking up a three-day-old file must place it at its recording timestamp — read from file
  metadata or the recorder's filename pattern — not at `now`. The rule is already stated in
  [pool-and-routing.md](pool-and-routing.md#the-feed-is-append-only); audio is where it breaks
  first, because import is decoupled from capture by days rather than seconds.
- **Partial files.** A share or a sync may expose a file mid-write. Intake must wait for a
  stable size/mtime or an explicit completion signal. This is listed today as an
  [open item](../flows/voice-notes.md#open-items-before-building) of the copy script; it
  becomes a property of intake itself.

## The audio item in the queue

Capture is instant, transcription is not. So an audio capture enters the pool immediately and
sits there **enriching**.

- It is **visible and processable before the transcript exists.** An untranscribed memo can be
  archived or routed; it just cannot be read. This is what makes *pipeline status on the phone*
  — a gap named in [unified-app.md](unified-app.md#what-exists-vs-whats-missing) — a real
  requirement rather than a nicety: without it you record and hope.
- **The audio is the capture; the transcript is enrichment.** Two consequences fall straight
  out of the model:
  - **Correcting a transcript is not an edit of the capture.** No revision, no `supersedes`, no
    re-enrichment cascade — unlike editing note text
    ([pool-and-routing.md](pool-and-routing.md#edits-are-revisions-not-mutations)). The audio is
    untouched; only a suggestion beside it changed.
  - **Re-transcribing later is always allowed and never destructive.** A better model in two
    years produces a *new* enrichment beside the old one, attributed to its own model
    ([PROV `wasGeneratedBy` / `wasAttributedTo`](../../standards.md#identity--provenance-the-cross-app-glue)).
- **Not all audio is speech.** Birdsong must not come back as a garbled transcript — an
  uncovered gap per [prior-art.md](../inspiration/prior-art.md). Non-speech is a legitimate
  capture with no transcript, routable as sound. The provider contract therefore has to be able
  to answer "this isn't speech" rather than always returning text.

  **Loosened 2026-08-02.** How well models actually reject non-speech is unproven, so this is a
  nice-to-have rather than a requirement, and the first iteration of core ships with no
  transcription provider at all. The likelier first shape is that transcription is **requested**
  — automatically for a source like a voice-memo app, explicitly for an arbitrary uploaded file
  ([ADR 7](../../adr/0007-enrichment-steps-declare-their-needs.md)). Note that the "not applicable"
  state this was meant to justify is needed anyway: an unconfigured provider and an
  unrequested step both produce it.

## Transcription is a provider, not a component

The core architectural point, and the one thing hardest to retrofit.

A **transcription provider** is an adapter with a narrow contract:

> audio in → `(text, word-level timestamps as WebVTT, detected language, confidence, is-speech)`
> out — asynchronous, with a completion signal.

This is the mirror image of the destination table in
[pool-and-routing.md](pool-and-routing.md#destinations-and-the-routing-table): **providers in,
destinations out**, both configuration rather than code.

| Provider kind | Example | Notes |
|---|---|---|
| Self-hosted, local | Speakr + WhisperX (the personal default), faster-whisper, whisper.cpp | Satisfies the privacy rule with no caveats. |
| Self-hosted, remote | a WhisperX endpoint elsewhere in one's own cloud | For deployments where the device's own machine isn't the transcriber. |
| External API | any OpenAI-compatible `/audio/transcriptions` service | Content leaves the trust boundary: opt-in, never a default, and visibly attributed. |
| Bring your own | arbitrary command or webhook | The escape hatch that keeps the interface honest. |

- **OpenAI-compatible `/audio/transcriptions` is the pragmatic wire format.** WhisperX wrappers,
  faster-whisper servers and commercial APIs all speak it, so a single adapter covers most of
  the field; a generic webhook adapter covers the rest.
- **Transcription and correction are two capabilities, not one.** Most providers return text and
  offer no way to fix it. Speakr's real distinction is its **correction UI** — transcript beside
  the audio player, click a line to jump to that moment. So a deployment may transcribe with one
  provider and correct in another, or not offer correction at all. Modelling these separately is
  what stops Speakr quietly becoming a hard dependency again.

### The same applies to every enrichment step

Formatting LLM, tag suggestion, destination suggestion, embeddings — all providers, all
configurable, all attributed on the item.

Which means the constraints in
[unified-app.md](unified-app.md#constraints-hard-requirements) — everything self-hosted, must
fit an RTX 2060 with 6 GB — are a **deployment policy and a personal default, not an
architecture.** They should stay exactly as strict for this deployment and stay out of the
interfaces, because that is the difference between software someone else can run and software
someone else has to fork.

Privacy then has to be enforced *and visible*:

- Each provider carries a trust level; the shipped default is local-only.
- Anything that sends content off-box is opt-in, per provider, and stated on the item — which
  `wasAttributedTo` already records ("transcribed by `whisperx-medium`" vs. a named external
  service).
- The [advisory-only rule](../../standards.md#the-ingestion-contract-the-inbox) is unaffected by
  provider choice: whoever produced it, the output is a suggestion beside the capture.

## What this changes about the Phase 0 flow

Nothing, for now — [voice-notes.md](../flows/voice-notes.md) stays as written. The migration,
when notemap exists, is three small moves:

1. The copy script's target changes from Speakr's watch folder to notemap's intake.
2. Speakr becomes a provider behind the adapter (transcription + correction) instead of the
   pipeline.
3. The transcript stops being auto-exported into `vault/voice/` and becomes an enrichment that
   gets **routed** like anything else — which is the whole point, since it means a voice memo
   can end up somewhere other than `voice/`.

## Deliberately open

- **Share-target or built-in recorder first.** Probably share-target: cheaper, and it doesn't
  compete with recorder apps that are already good.
- **Where correction happens** — delegated to a provider's UI, or a minimal transcript editor in
  notemap. Delegation is the honest default; it just doesn't exist for every provider.
- **Audio retention.** Today the file is stored twice (vault archive + Speakr working copy). With
  notemap holding the blob, the question becomes whether routing *copies* the audio to the
  destination or leaves a reference — and that answer probably differs per destination.
- **Long recordings.** An hour-long lecture needs chunking and a different UX from a
  ninety-second memo. Possibly not a use case at all; deferred until it hurts.
- **Diarization and non-speech classification** — model choice, and whether either earns its
  VRAM. Skipped for now, single-speaker memos being the norm.
