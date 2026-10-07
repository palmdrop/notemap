# Review: Attachments of any kind (PR #95)

**Date**: 2026-10-07
**Status**: Addressed
**Scope**: `git diff main...agent/attachments-of-any-kind`: `apps/relay-arena`, `apps/daemon` (assets limits), `packages/client` (attachments, upload limit), `apps/ui` (capture box, edit, reading), `packages/adapters/destination-arena`, docs
**Plan**: `docs/plans/attachments-of-any-kind.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`, `docs/specs/http-v1.md`, `CONTEXT.md`, `apps/relay-arena/README.md`

---

## Overall

The PR does what the plan says. The relay links every block, the limits route is in place and authenticated, the client API is renamed and covers many attachments, and the shell draws two pictures plus lines. Old `image`-slot items and old `web-manual`/`web-image` sources still read correctly. Typecheck, lint and `pnpm -r --silent test` all pass. Two bugs:

- The capture box now attaches several files in one loop. If attaching one of them fails, the files already attached stay in the store with no operation behind them, and nothing will ever reclaim them.
- The process surface's preview was not ported. It still draws every image and no other attachment.

The rest is misplaced comments in `client.ts`, two spec sentences the new drawing contradicts, and missing tests for the limit lifecycle and the refused-capture restore. The plan's by-hand pass is still unchecked: capture a PDF, download it, attach an oversized file. Both of the plan's Unknowns are still unverified: the cookie-authenticated `<a download>` and the browser's storage quota.

---

## Bugs

### 1. A failed attach part-way through a capture strands every file attached before it

`apps/ui/src/components/capture/Capture.svelte:149`: `for (const file of chosen) assets.push(await client.attach(file));`. Each `attach` writes a store blob and holds it. Bytes are released only when the operation that names them leaves the outbox (`packages/client/src/assets/assets.ts`, `releasedBy`), and per client.md nothing sweeps bytes with no operation behind them. That is why the spec says the box "attaches and captures in the same gesture". With one file this held. With N files it doesn't:

```
file 1 attached (blob held) → file 2 throws → capture never sent
→ file 1's bytes held forever; pressing capture again attaches file 1 a second time
```

This is reachable today. The plan's own Unknown, the store refusing a large file over quota, fails on file N. A limit learned between pick and commit makes `attach` throw a `Refused`. A refused capture restored by `editRefused` puts its files back without passing through `refuses()`, so the oversized file that caused a 413 comes back and throws at commit.

Fix: check `client.refuses` for every file before the first `attach`, and give the client a way to release blobs it attached when the capture that would have named them is never made (or make the capture-and-attach a single client call that cleans up on failure).

### 2. The process preview still draws every image and nothing else

`apps/ui/src/components/process/Process.svelte:104` passes `attachments.filter(isImage).map(url)` to `Preview`. `apps/ui/src/components/process/Preview.svelte:99` draws all of them, unbounded, and draws no line for a PDF or any other file. The spec (shell.md, Content) says "a capture of twenty photographs does not become twenty screens" and that "the record's block and the process surface read a capture the same way". The plan lists Process as ported. The preview's own doc comment (`Preview.svelte:23-25`, "as they do on a delivered record") is now false: `record/Block.svelte` draws two pictures and lines.

Fix: hand `Preview` the attachments and draw them through `AttachedPictures`/`AttachedLines`, as `Block.svelte` does.

---

## Design

### 3. Comments in `client.ts` were split from their code and stacked on the wrong function

`packages/client/src/client.ts:212-214`: "The watcher keeps its own tempo…" belonged to `onReach`. The new block was inserted after it, so it now heads `maxUpload`, and `onReach` (~L249) has lost it.

`client.ts:218-221`: two unrelated paragraphs are stacked above `refused`. The first ("Asked only where it can be answered: a `401`…") describes `askedLimits`/`onSession`, not `refused`.

`client.ts:215`: "once a signed-in read has said" is false for an install that requires no credentials, where the limit is read without a sign-in.

The project rule is that a comment must be true of the code it sits on.

### 4. Two spec sentences contradict what the shell now draws

`docs/specs/shell.md:2435`: "Its attachments are drawn above it, in slot order…". The amendment that follows says every non-picture is a line *under* the words. The lead sentence needs rewriting rather than amending.

`shell.md:801`: "opening an edit moves nothing but the pictures shrinking to the box's size". This is false for a capture with three or more pictures. The third picture is a line under the words when read, and a thumbnail above them in the edit (`Edit.svelte` draws every image above). Each picture also gains a name line in the edit.

The edit's refusal of an oversized file (a notice, raised from `editing.svelte.ts` `pick`) is in the plan but not in shell.md.

### 5. Test gaps on the new behaviour

- Client: nothing tests that a lapsed session or a sign-out drops `maxUpload`, that a pool-identity change drops and re-reads it, or that the limit is not asked while credentials are required and absent. `assets.test.ts` only covers a pool that asks no credentials.
- UI: there is no test of the capture box refusing a file at pick (`Capture.svelte:123-134`), and none of an edit raising the refusal as a notice.
- `apps/ui/src/lib/refused.ts` has no tests. `editRefused` now reads back several files, names them and appends them, and none of that is covered.
- Daemon: no test that `GET /v1/assets/limits` answers 401 without credentials, which http-v1.md promises.

### 6. An edit's dropped, reverted or abandoned attachments stay in the store

`apps/ui/src/components/item/editing.svelte.ts:107,112,125`: an edit attaches at pick. `drop`, `revert` and `abandon` forget the asset id but leave its bytes held, and no operation will ever release them. The problem predates this PR but was bounded at one picture. It now covers any number of files of up to 256 MiB each. Same remedy as #1.

---

## Minor

### 7. Capture previews are indexed by position and re-minted on every change

`Capture.svelte:83-89, 194, 222`: every add or drop revokes and re-mints every object URL. Between `chosen` changing and the effect re-running, `previews[at]` reads the old array with new positions, so a thumbnail can briefly point at another file's URL or a revoked one. There is no leak, because the cleanup revokes. A `File → URL` map, minted once per file and revoked on drop or unmount, avoids all of it.

### 8. A held line with no URL yet is a link that downloads the page

`apps/ui/src/components/item/HeldAttachment.svelte:40`: `url={url ?? ""}`. The result is `<a href="" download>` for the tick before `previews` is filled. Draw the name without a link while `url` is undefined.

### 9. A refusal at pick names only the first file, and not by name

`Capture.svelte:127-133`: with several files picked and two too large, both are dropped but only one refusal is said, and nothing tells the person which file it was.

### 10. Thumbnails share one alt text

`Capture.svelte:197,224` and `Edit.svelte:67,98`: every thumbnail is "What is about to be captured" or "What it carries", so a screen reader cannot tell them apart. Use the filename. The `×` buttons are labelled `remove <name>`, which is fine.

### 11. `attachmentsIn` sort and the duplicated slot convention

`packages/client/src/capture/attachments.ts:29`: the comparator never returns 0, and the order is lexicographic, so slot `1000` sorts before `999`. Neither will happen in practice, since slots are unique under the store's PK and no capture carries 1000 files. `slotFor` is defined twice, here and in `packages/relay/src/assets.ts:55`. Two copies of one wire convention can drift.

### 12. `sizeOf` edges

`apps/ui/src/lib/attachments.ts:44-50`: 999 999 bytes reads "1000 KB", 9 960 reads "10.0 KB", and 1 reads "1 bytes".

### 13. The limit fetch can land after the reset it raced

`client.ts:228-235, 298`: an `askedLimits` still in flight across a sign-out or a pool change writes the old value after `maxUpload = undefined`. Separately, while the limit is unknown, every health tick asks again. Against a daemon without the route, that is one extra request per tick. Both are harmless today.

### 14. No rule under the record's "nothing kept" line

`apps/ui/src/components/record/Block.svelte:287`: `ruled={body !== undefined}`. When `NOTHING_KEPT` is drawn, the lines sit under words with no rule.

### 15. Small inconsistencies

- `apps/daemon/src/app.ts:300` registers `assetLimitsRoute.path` raw, where every neighbour goes through `honoPath(...)`.
- `docs/specs/client.md:967` is an unwrapped long line with an awkward sentence ("or where nothing asks anyone to be").
- `docs/running.md:310,313` still shows `web-manual` in its example frontmatter.

### 16. Download behaviour not verified across origins

`AttachmentLine.svelte`'s `download` attribute is ignored on a cross-origin URL. If the shell and the daemon are ever on different origins, a third picture drawn as a line would open inline instead of downloading, since the pool serves images `inline`. This is the plan's open Unknown, and the by-hand pass is unchecked.

---

## Non-issues

- **Old `image` slot**: `attachmentsIn` reads it like any slot. Digits sort before letters, so it falls after numbered slots. The next edit renumbers it, as the plan intends.
- **Old `web-manual` / `web-image` sources**: nothing in the shell branches on them any more. They remain discoverable sources, as the ADR 38 amendment says.
- **Route order comment in `app.ts:299`**: accurate. Hono matches in registration order, and the daemon test asserts the 200.
- **Session-gated limit and 401s**: `askedLimits` is gated on a known session that is signed in or not required. `sessions.lapsed` ignores a 401 while not signed in, so the fetch cannot cause a spurious lapse.
- **Object URLs in the capture box**: revoked on effect re-run and unmount. No leak, even though #7 stands.
- **Nested slide transitions**: Svelte 5 transitions are local, so items don't animate again when their section opens or shuts.
- **Arena destination comment**: accurate. `preview` calls `wanting`, so routing by hand hears the many-asset refusal before deciding.
- **`HeldBlob.filename`/`bytes` after a reload**: rebuilt from the stored `File`. The filesystem store keeps the name in its record, and IndexedDB stores the `File`.
- **fs/webdav destinations with many assets**: names come from the blob digest, and slots are only map keys, so renumbering is harmless.
- **Shipped trail**: the plan is `In progress`, not Done. Shipped entries are already in client.md, http-v1.md and shell.md.

---

## Resolution

*2026-10-07, on the same branch.*

1. **Fixed.** The box checks `client.refuses` for every file again at the button, drops and names
   any it refuses, and attaches nothing. If a capture fails after attaching, it lets go of every
   asset it attached through a new `client.detach(asset)`, which leaves alone any bytes an
   operation still names. Tests in `Capture.test.ts` (refused at pick, refused at the button,
   released on a failed attach) and `assets.test.ts` (`detach`).
2. **Fixed.** `Preview` takes the capture's `attachments` and draws them through
   `AttachedPictures` and `AttachedLines`, with a rule when words are written. Its doc comment is
   rewritten. Test in `Preview.test.ts`.
3. **Fixed.** The `onReach` comment is back above `onReach`, and each comment sits on the code it
   describes. `maxUpload`'s doc no longer claims a sign-in.
4. **Fixed.** shell.md's Content lead now says "around", and the edit paragraph says what opening
   an edit moves (no file crosses the words; pictures shrink, and a third picture joins the
   thumbnails). The edit's refusal is specified. The box paragraph now covers the check at the
   button and the release on failure.
5. **Covered.** Client: not asked while credentials are wanted and absent, forgotten on sign-out
   and on a lapsed session, asked again of a changed pool. UI: refusal at pick and at the button,
   the edit's notice, and a refused capture with two files restored by name
   (`StatusLine.test.ts`). Daemon: `/v1/assets/limits` answers 401 without credentials. The
   pool-change test also found a bug: on a cold start the client holds no pool identity yet, so
   the first health answer counted as a pool change and threw away the limit it had just learned.
   The limit is now forgotten only on a change from a known identity.
6. **Deferred** to [todo.md](../todo.md) ("An edit's dropped, reverted or abandoned attachments").
7. **Fixed.** One object URL per `File`, minted once and revoked on drop or unmount.
8. **Fixed.** `AttachmentLine` draws the name without a link while it has no URL.
9. **Fixed.** A refusal names every refused file. The edit's notice names its file too.
10. **Fixed.** A thumbnail's alt text is its filename.
11. **Sort fixed** (numeric). **Duplication kept:** `packages/relay` and `packages/client` share no
    package, and a new one for a three-character pad is not worth it.
12. **Fixed.** `1 byte`, and no size that rounds into the next unit (`10 KB`, `1.0 MB`).
13. **Fixed.** A counter moves on whenever the limit is forgotten, an answer to an older question is
    dropped, asks in flight are not repeated, and a daemon that refuses the route is not asked
    again until the limit is next forgotten.
14. **Fixed.** The record block rules its lines under anything written there, "nothing kept"
    included.
15. **Fixed.** `honoPath` on the route. client.md's limit paragraph is rewritten. running.md's
    example says `web` and `note`; its `payload_type: 'text'` had been stale since ADR 38.
16. **Not changed.** The daemon serves the shell, so the two share an origin. This only matters if
    they are ever split, which security.md already has as an open question.
