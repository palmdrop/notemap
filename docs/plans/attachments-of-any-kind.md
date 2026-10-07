# Attachments of any kind

**Date**: 2026-10-07
**Status**: In progress
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`, `docs/specs/http-v1.md`, `CONTEXT.md`, `apps/relay-arena/README.md`
**Closed**:

---

## Goal

A capture carries any number of files of any media type, from the shell or a relay. The shell
previews the first two images and draws every other attachment as a line with its filename, media
type, size and a download link. An oversized file is refused in the capture box, not at drain. Every
are.na block's prose links back to the block.

---

## Decisions taken

- **No PDF preview.** PDFs keep `attachment` disposition
  ([http-v1.md](../specs/http-v1.md#inline-or-attachment)). A preview through pdf.js in a
  null-origin sandboxed iframe was considered and deferred.
- **No source-specific knowledge in the shell.** The block link goes in the prose, written by the
  relay. The first full poll amends or revises the roughly 20 items already relayed, once each.
- **Many slots per capture.** Slots are zero-padded and ordered (`000`, `001`, …), as
  `packages/relay` already writes them. They are drawn in slot order. Items that already exist keep
  their `image` slot and are read like any other.
- **One shell source, `web`**, replaces `web-manual` and `web-image`. This reverses part of
  [ADR 38](../adr/0038-text-and-image-collapse-into-one-payload-type.md). The ADR gets a dated
  superseding note, not an edit. Items already in the pool keep their old sources.
- **"Picture" becomes "attachment"** throughout the client API, the UI and the draft, and in
  `CONTEXT.md`. "Picture" stays only where a thing is really drawn as an image.
- **The upload limit stays at 256 MiB** (`assets.maxUpload`).

---

## Tasks

### Phase 0

- [x] Branch `agent/attachments-of-any-kind` _(2026-10-07)_

### Phase 1 — the relay links each block (independent)

- [x] `relayed.ts` composes `https://www.are.na/block/<id>` into the prose of every block that is
      not a Channel, as the last paragraph, after the source URL. A block's own words that already
      hold the link don't repeat it, by the rule that already applies to source URLs.
- [x] A block with no prose and no file still isn't captured. The link alone doesn't make it
      capturable.
- [x] Update the README table and the "a change to how the relay reads a block is an edit" note.
- [x] Verify: `pnpm --filter @notemap/relay-arena test`, with `relayed.test.ts` covering an
      Attachment block whose title is a filename (the PDF case) and a Link block whose caption
      already holds the block URL
- [x] Commit _(2026-10-07)_

### Phase 2 — the client carries many attachments, under one source

Depends on nothing. Phase 4 depends on it.

- [ ] **Agree the API with the developer before coding.** It replaces `picture` / `pictured` /
      `images` in `packages/client/src/types.ts`. Proposed: `attachments(item)` answers every
      asset in slot order, each with id, filename, media type, size and URL. `attached(payload,
      assets)` writes the ordered list back into slots. Whether `images` survives as a filter
      over `attachments` is part of that conversation.
- [ ] `capture/picture.ts` → `capture/attachments.ts`. `envelope.ts` names every asset the box
      holds. Rewrites that only touch the words (`saying`) leave the asset list alone.
- [ ] An edit of an item that still uses the `image` slot rewrites its assets into ordered slots.
- [ ] `apps/ui/src/lib/channels.ts`: one constant, `web`.
- [ ] Update client.md (the one-picture-slot passages, around L930–962 and L987) and the
      superseding note on ADR 38.
- [ ] Update `CONTEXT.md`: **Draft** holds attachments, and **Source** loses "its picture".
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm -r lint`
- [ ] Commit

### Phase 3 — the client knows the upload limit

Depends on nothing. Phase 4 uses it.

- [ ] Daemon: `GET /v1/assets/limits`, authenticated, answers `{ "maxUpload": <bytes> }` — the
      name and unit the `413 asset-too-large` refusal's `max` already uses. Not on health, which
      says whether the daemon is up and what it is, and not a pool setting, being what the install
      is. http-v1.md and `definitions.ts` in the same change.
- [ ] Client: read it once signed in, hold it beside the pool identity, read it again when the
      identity changes, and refuse `attach(file)` over it with a typed refusal before anything is
      written to the store. Where the limit isn't known yet (never online), accept, and the
      drain's `413` stays the backstop.
- [ ] Verify: `pnpm -r --silent test`, then `pnpm test:stack` (crosses the HTTP surface)
- [ ] Commit

### Phase 4 — the shell attaches and draws any file

Depends on phases 2 and 3.

- [ ] Add an attachment line primitive: filename, media type, size, and a `download` link to
      `GET /v1/assets/{id}/content`, or to the store's `blob:` URL while the capture hasn't
      drained. Words only, in the one face and size.
- [ ] `Payload.svelte`: the first two images in slot order are drawn as pictures. Every other
      attachment, images past the second included, is drawn as a line. The `<Figure>` fallback
      remains only for an item with no words and no assets.
- [ ] `queue/Index.svelte` `whatItIs`, `process/Process.svelte` and `record/Block.svelte` draw
      the same way.
- [ ] Capture box: `attach` takes any file and can be pressed again to add more. Each attachment
      is drawn before commit (a picture for an image, a line otherwise), each with its own `×`. A
      file over the limit is refused in the status line and isn't attached.
- [ ] Edit: the same. `drop` per attachment and `attach` adds, replacing "at most one, the
      capture's own shape".
- [ ] `lib/draft.ts` holds a list of files in memory, under its new name.
- [ ] Update shell.md: capture box, edit, Content. Replace "a note carrying a recording is not
      drawn as a broken image" with what is drawn, and add the dated amendments.
- [ ] Verify: `pnpm -r --silent test`, `pnpm -r typecheck`, `pnpm -r lint`. By hand: capture a
      PDF and three images and see two pictures and two lines. Download the PDF. Capture
      offline, then reload. Attach a file over the limit.
- [ ] Commit

---

## Unknowns

- **Browser storage quota for large files held offline.** A file of a few hundred MiB may exceed
  what the store can hold. Fallback: a write the store refuses is refused at attach time, just as
  an oversized file is, and the box says so.
- **A cookie-authenticated `<a download>` on the content route.** `<img>` already works with the
  cookie, so a link should too. If it doesn't, fetch the bytes and hand a `blob:` URL to the link.
- **Seeds and fixtures that name `web-image` / `web-manual`** (`tests/seed`, `tests/full-stack`,
  daemon renderer tests). These are rewritten to `web` where they stand in for the shell, and
  left alone where they stand in for an arbitrary source.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
