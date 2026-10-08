# Review: Attachments only (`place-assets`)

**Date**: 2026-10-08
**Status**: Addressed
**Scope**: `git diff main...agent/attachments-only` (PR #97): `packages/output-markdown/src/{placing,capabilities}.ts`, `packages/adapters/destination-{fs,webdav}`, `packages/core/src/pool/destinations/vocabulary.ts`, `apps/ui/src/components/{process/Process.svelte,settings/TemplateForm.svelte,settings/Template.svelte}`, `apps/ui/src/lib/capability.ts`, docs
**Plan**: `docs/plans/attachments-only.md`
**Spec**: `docs/specs/core.md`, `docs/specs/shell.md`, `CONTEXT.md`, ADR 0057

---

## Resolution

Fixed on the branch: 1, 2 (retried, and claims matched case-insensitively), 3, 4 (ADR corrected,
and a preview no longer reads files), 7, 8, 9, 10 (pinned by a test, kept as is), 11, 12, 13, 14.

Kept as is: **5**, the developer chose `output` as the shell's word, and `CONTEXT.md` records the
difference from the glossary's **Output**. **6**, the record's verb table names every capability it
has a past tense for; the plan's claim is narrowed to choosing the capability, which goes by the
annotation.

---

## Overall

The implementation matches the ADR and specs. The naming walk is correct for the retry case it
was designed for, containment is sound on both kinds, and the plan's `Shipped:` entries are in
`core.md` and `shell.md`. `pnpm -r --silent test`, `pnpm typecheck` and `pnpm lint` are green.
No blockers. The most important finding is in the UI: words rewritten before an
attachments-only capability is taken by a template survive and are sent (1). On the adapter side,
a collision the walk could have walked past gets `rejected`, and that is permanent, after some
files have already landed (2). The ADR also misdescribes when the full read happens: it is mostly
the *same*-bytes case, i.e. every re-route and every preview (4).

---

## Bugs

### 1. Should fix. A rewrite survives into an attachments-only delivery reached by any path other than the `output` toggle

`apps/ui/src/components/process/Process.svelte:376` (`release`), `:683` (`take`), `:570` (`carried`), `:1012`.
Only `output(true)` clears `words`/`editing` (`:304-305`). `release()` and `choose()` don't, and
`take()` goes through both of them.

```
edit → type "rewritten" → pick a template whose capability is place-assets
→ assetsOnly true, edit button hidden, but `editing` still true → textarea + "keep the capture's"/"done" still drawn
→ carried() returns { content } → preview and commit both send a rewrite with place-assets
```

The same happens with a kind that settles nothing and offers the carrier under `do`. The record
then claims a rewrite that the delivery cannot carry, which breaks shell.md's "words already
rewritten are let go". It is also the surface's only route to the rewrite once the `edit` button
is gone.

Fix: derive it. Let `carried()` answer `{}` whenever `assetsOnly`, and hide the editor while
`assetsOnly`, instead of clearing state in one transition only. Add a test that takes an
attachments-only template after a rewrite.

### 2. Should fix. A taken name found at write time is `rejected`, which is permanent, though a retry would walk past it, and earlier files have already landed

`packages/adapters/destination-fs/src/placing.ts:84-89`, `packages/adapters/destination-webdav/src/placing.ts:102-106`.
`EEXIST` / `412` becomes `Refused`, which is `rejected`. A rejected job is abandoned on the first
attempt. For this capability that is the wrong side of the line: a second attempt re-walks, finds
the intruder, and lands on `-1`. If the intruder is our own copy, the retry finds the same bytes
and writes nothing, so retrying cannot duplicate. Meanwhile assets earlier in the loop are already
written, so a `rejected` record now sits beside files in the vault that nothing points at.

One trigger is deterministic rather than a race. Two attachments `Scan.pdf` and `scan.pdf` with
different bytes on a case-insensitive volume (macOS default, Windows, some WebDAV backends): the
walk claims both names, because `claimed` is case-sensitive (`output-markdown/src/placing.ts:51`),
and the second `link` hits `EEXIST`. The same goes for NFC/NFD-different names on APFS. On the
retry, `lstat` would see the first file and walk on.

Fix: map the conditional-create failure in `place-assets` to `unreachable`, and amend ADR 57
("losing that race is `rejected`", `:75`) and the fs/webdav READMEs. Optionally compare
`claimed` case-folded. There is no fs test for this path at all (WebDAV has "refuses where the
name is taken between the walk and the write").

### 3. Should fix. Switching to `attachments only` reads the folder from the line field alone

`apps/ui/src/components/process/Process.svelte:300`. `placeOf(args[LINE_FIELD])` assumes the
current capability is the line's. An applied template whose capability is `create` holds its
folder in `directory`, not `path`, and `offersOutput` is still true because `implied` is
`create-or-append`. Toggling drops the template's folder to the root. Toggling back then yields
`create-or-append`, not the template's `create`. The template's folder mode (`require`/`establish`)
is dropped both ways (`args` is replaced wholesale), so a commit after toggling silently becomes
`create`. Fix: read the folder through the current capability's `folders`/path field, and decide
whether `folder` mode should carry across. Untested.

---

## Design

### 4. Should fix. The full read is paid on the *same*-bytes case, i.e. every re-route, every retry, and every preview keystroke

`packages/output-markdown/src/placing.ts:125-133`, `packages/adapters/destination-webdav/src/placing.ts:140-151`.
Size-first only spares files whose size *differs*. A file holding the same bytes always matches
on size and is always read in full. That is exactly the re-route and retry case, and on WebDAV it
is a download. `preview` runs the same walk (`destination-webdav/src/destination.ts` preview
branch), and the shell asks for a preview on every settled change to the decision. Typing a folder
that already holds a 200 MB recording downloads it once per settle. ADR 57's Consequences
(`:89`, "a name taken by **different** bytes costs a read") states the opposite case, and so does
the plan. At minimum, correct the ADR. Consider not hashing in `preview` (answer "may already be
there" on a size match), or caching digests per `(path, etag/size)` for the life of a preview
session.

### 5. Should fix (discuss). `output` overloads a glossary term instead of picking a word

`CONTEXT.md:397-400`. **Output** is a domain term: what a delivery produced, drawn under
`preview`. This PR documents the shell spending the same word on "what a delivery carries" and
justifies it by analogy to `discard`/archive. AGENTS.md says to fix a term rather than invent a
synonym, and the inverse (one word, two meanings) is worse. The concept already has a name in this
PR: `x-notemap-carries`, and ADR 57's option 2 called it `carry`. A `carries` section
(`everything` / `attachments only`) would read the same and collide with nothing. If the label
stays, the reasoning belongs in an ADR line, not in the glossary entry for the other meaning.

### 6. Should fix. The shell does know `place-assets` by name

`apps/ui/src/lib/capability.ts:14`. `"place-assets": "placed"` contradicts the plan (`:27`, "never
knows `place-assets` by name") and the spirit of shell.md/ADR 57 ("found by its annotation and
never by its name"). The `DID` table already names the other three, so this is the existing
pattern, but the docs now claim otherwise. Either answer `placed` from `carriesAssets` on the
record's capability where the schema is held, or soften the doc claim to "chooses it by annotation".

---

## Minor

### 7. WebDAV walks every name before learning whether the folder exists

`packages/adapters/destination-webdav/src/placing.ts:41-44` then `destination.ts` (`requirePlacingFolder`, `makePlacingFolder`).
On a missing folder, each asset costs a `PROPFIND` that must answer 404. A server that answers 409
for a child of a missing collection gets `refused` (`dav.ts:250`), then `Unreachable` from
`occupantOf`. Under `create` mode that retries forever and never reaches `MKCOL`. One `look` at the
folder first, treating everything as free when it is absent, removes both the requests and the
edge case.

### 8. `digestOf` answering `""` for a file gone mid-walk skips a free name

`packages/adapters/destination-webdav/src/placing.ts:146`. A file deleted between `look` and
`read` makes the walk continue to `-1` even though the name is now free. This is harmless for
idempotency, but the comment ("holds nothing these bytes could match") makes it sound deliberate.
Treating it as `free` is simpler and right.

### 9. TemplateForm: `everything` always returns to `actions[0]`

`apps/ui/src/components/settings/TemplateForm.svelte:105`. Editing an `append` template, taking
`attachments only` and then `everything` leaves it as `create-or-append`. Remember the
pre-toggle capability.

### 10. `numbered` splits at the last dot

`packages/output-markdown/src/placing.ts:117-123`. `archive.tar.gz` becomes `archive.tar-1.gz`.
This is consistent with `assetName`, so it can stay, but no test pins it.

### 11. fs `digestOf` ignores the abort signal

`packages/adapters/destination-fs/src/placing.ts:113`. A cancelled delivery still hashes a large
colliding file to the end. `createReadStream` accepts `signal`.

### 12. Test fixtures are weaker than the real schema and bytes

- `apps/ui/src/components/process/Process.test.ts` `PLACE_ASSETS` has no `folder` mode field and
  no `additionalProperties: false`, so the folder-mode handling in 3 is untested by construction.
- `destination-webdav/src/testing/dav-server.ts` stores bodies as UTF-8 strings, so the WebDAV
  walk and its size/hash comparison are only ever exercised with text. A binary asset (the PDF
  case) would be mangled by the fixture, not by the adapter.

### 13. Missing tests for changed behaviour

- Process: a template whose capability is `place-assets`, taken read-only. Cover the `output`
  section drawn with `attachments only` taken, the settled place reading the folder, and an
  untouched commit going as `{ template }`.
- Process: the rewrite-then-template path (1). The `create`-template toggle (3).
- fs: `EEXIST` between the walk and the write (2).
- TemplateForm: toggling back restores the prior action (9).

### 14. Plan text is stale

`docs/plans/attachments-only.md:49` still states the decision as "an `attachments only` toggle in
`place`", and the Unknowns at `:64` and `:67` are resolved but not struck through. The tasks note
the change, but a reader of "Decisions taken" gets the superseded shape.

---

## Non-issues

- **fs README's rewritten asset-naming bullet**: the old text claimed note assets walk `-1`;
  `assets.ts` names them by digest and treats `EEXIST` as landed. The new text corrects a stale
  doc.
- **WebDAV README's candidates paragraph**: "Neither field offers candidates" was already false
  before this PR. Fixed here.
- **`lstat`, not `stat`, in `occupantOf`**: a symlink at the name is `other` and walked past, so
  no bytes outside the root are read. Containment of the folder itself still goes through
  `contain`'s realpath check, and asset names come from `oneSegment`, which cannot hold `/`, `\` or
  a leading `.`, so they cannot reach `.notemap-` temporaries.
- **Comparing `blob` to a SHA-256 hex digest**: blob identity is specified as SHA-256 in
  `standards.md` and `CONTEXT.md`, and `blob-fs` answers hex.
- **`x-notemap-carries` as a literal in the UI**: the UI reads every other `x-notemap-*` keyword
  as a literal too (`lib/schema-form.ts`).
- **Same blob, same name, twice in one delivery**: the second `Placement` repeats the name, and
  both `carryOutPlacing` (`written` set) and `placedOutput` dedupe it.
- **Delivery concurrency**: the work runner performs leases serially, so the race in 2 needs an
  outside writer (a sync client) or two commits at once. It is still real; see the case-folding
  trigger.
- **Losing the filename when taking `everything`**: shell.md specifies that the line comes back
  holding the folder only.
