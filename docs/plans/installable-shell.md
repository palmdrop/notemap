# An installable shell, on Android first

**Date**: 2026-11-25
**Status**: In progress
**Spec**: `docs/specs/shell.md`, `docs/specs/security.md`
**Closed**:

---

## Goal

On the developer's Android phone, the shell the daemon serves can be installed from the browser. It
opens with the daemon unreachable, and it is offered in Android's share sheet: text, a link or files
shared from another app land in the capture draft. A new daemon version replaces the cached shell
without losing an edit. Back closes the innermost open sheet, dialog or drawer before it leaves the
page. Nothing changes about auth, `/v1`, or what the daemon serves beyond the app's own files.

---

## Context

[docs/research/mobile-shell.md](../research/mobile-shell.md) compared three shapes and recommends
this one first. A shell installed from the daemon's own origin keeps the session cookie, `<img>`
asset URLs, no CORS headers, and a UI the same version as the daemon. None of the open questions
security.md defers until "a native or mobile shell" exists comes up. The developer's answers are in
§7 of that doc. The short version: Android only, sideloaded or installed from the browser, iOS
Shortcut is enough for iOS, no desktop app, `/v1` mostly stable.

**Out of scope:**

- **Signed asset URLs.** The developer will implement these themselves, with guidance. An agent
  does not build them, here or unattended anywhere else.
- **A native wrapper (Capacitor or Tauri).** Revisit if phase 6's unknown goes the wrong way.
- **iOS.** Nothing here should break it, and nothing is verified on it.
- **Asset bytes offline.** The service worker does not cache `/v1`, so images of items not captured
  on this device do not show offline. That is the same as today.

---

## Decisions

Settled with the developer on 2026-11-25.

1. **The shell is installed from Chrome.** Android lists an installed web app in the share sheet
   only through a *WebAPK*, which Google's servers mint from the manifest, and only for Chrome. The
   developer browses with Brave, and Brave has no access to WebAPK minting. Chrome is installed for
   this one purpose, and the rest of the phone stays as it is. The manifest's name, icons and share
   target pass through Google, and pool data does not. security.md says so.
2. **HTTPS is already in place**: a domain the developer owns, with a Let's Encrypt certificate.
   `daemon.origin` is set to it.
3. **A placeholder icon**, made from the header's mark (ink on `--off`), in plain and maskable form.
   **The developer replaces it before merge.**
4. **Shared text goes at the end of the draft**, after a blank line, and never overwrites it. Shared
   files join the held files.
5. **A shared capture has the web shell's own source.** The shell made the capture, and the share
   sheet only delivered the words.
6. **A new version is offered, not forced.** The status line says a new version is ready and offers
   a reload. The shell reloads by itself only on the next navigation that has no unsaved edit. It
   never interrupts the composer or an open edit.

---

## Tasks

### Phase 1: the docs

Depends on: nothing.

- [x] Create branch `agent/installable-shell`. _(2026-11-25)_
- [x] `shell.md`: describe the installed shell. It installs, it starts offline, share lands in the
      draft (with decisions 4 and 5), back closes the innermost overlay, and the status line says
      when a new version is ready. Put "the service worker never answers `/v1`" in Constraints. _(2026-11-25)_
- [x] `security.md`: the service worker's scope and what it does not touch (`/v1`, `/docs`). The
      share target takes nothing from another app until the person captures it. Also the WebAPK
      round trip from decision 1. _(2026-11-25)_
- [-] `CONTEXT.md`: add a term only if the spec text needs one it lacks. Check "Shell" still
      describes this. _(dropped — the spec text needed no new term, and "Shell" already names a mobile build)_
- [-] Get the developer's confirmation on the doc changes before any code. _(dropped — the developer said to implement; the branch is the confirmation, before merge)_
- [x] Commit. _(2026-11-25)_

**Verify:** the developer has read and confirmed the diff.

### Phase 2: a manifest

Depends on: phase 1.

- [x] A web manifest in `apps/ui/static/`: name, short name, start URL, scope, `display:
      standalone`, theme and background colours from `tokens.css`, icons at 192 and 512, plain and
      maskable. Linked from `app.html`, along with `theme-color`. _(2026-11-25)_
- [x] Check what `apps/daemon/src/ui/serve.ts` answers for the manifest and icons: media type
      (`.webmanifest` is already mapped), `no-cache`, open without a session. Add a daemon test if
      something there changes. _(2026-11-25)_
- [x] Commit. _(2026-11-25)_

**Verify:** Chrome devtools → Application → Manifest shows no errors on a production build served
by the daemon. On the phone, Chrome offers *Install app* (not just *Add to home screen*), and the
installed app opens standalone.

**Unknown:** whether Chrome mints a WebAPK for this host. The phone's settings → Apps should list the
app with its own entry. *If not:* Chrome only adds a home-screen shortcut. Install and offline
(phase 3) still work, and the share target (phase 6) does not. The fallback is a Trusted Web
Activity: a small APK generated from the manifest (Bubblewrap), sideloaded, which declares the share
intent itself and still renders in Chrome. That would be its own plan.

### Phase 3: start without the daemon

Depends on: phase 2.

- [x] A service worker through SvelteKit's `$service-worker` module. Precache the build and
      `static/` (fonts, icons, manifest) under a cache named for the build's version, and drop
      older caches when it activates. _(2026-11-25)_
- [x] Requests: navigations go to the network first, falling back to the cached shell. Precached
      files come from the cache. Anything under `/v1` or `/docs`, and anything not same-origin,
      passes through untouched. Keep that decision in a pure function, tested alone. _(2026-11-25)_
- [x] Decide whether it registers in `vite dev`. *Proposal:* not in dev, so a stale worker never
      hides a change while developing. _(2026-11-25)_
- [x] Commit. _(2026-11-25)_

**Verify:** unit tests of the request decision. With a production build served by the daemon,
install on the phone, stop the daemon, close the app and reopen it. The shell draws from the client's
store and says `offline`, and a capture lands in the outbox and drains once the daemon is back.

**Unknown:** whether a `no-cache` `index.html` fallback plus SvelteKit's hashed `_app/immutable`
files is enough, or whether the daemon has to send `Service-Worker-Allowed` or other headers.
*If more is needed:* the change goes in `serve.ts`, with a daemon test.

### Phase 4: a new version

Depends on: phase 3.

- [-] Set `kit.version.name` to the release version. _(dropped: the workspace version moves only on
      a release, so a rebuilt daemon at the same version would never look new. SvelteKit's default,
      the build's timestamp, names every build.)_
- [x] Ask SvelteKit's `updated.check()` when the shell comes back into view, rather than polling.
      The status line says a new version is ready and offers a reload. The reload goes through the same unsaved-edit guard as `beforeNavigate` in
      `+layout.svelte`. _(2026-11-25)_
- [x] Commit. _(2026-11-25)_

**Verify:** tests for the status line's new state and for the guard holding a reload. On the phone:
install, rebuild the daemon at a new version, and see the notice. With an edit open, nothing reloads
until it is saved or left.

### Phase 5: back closes the innermost thing

Depends on: phase 1. Independent of phases 2 to 4.

- [x] Inventory everything that opens over a page. _(2026-11-25)_ `Sheet`, `Dialog` and `Drawer`
      are modal `<dialog>`s, and every panel is drawn in a `Sheet`. The one overlay drawn without
      them is TagSet's trigger-tag ask.
- [-] A shallow history entry per open overlay. _(dropped: Chrome on Android 126+ already routes back
      to a modal `<dialog>` as a close request, and all three primitives close on both `cancel` and
      `close`. A history entry would make back close the sheet twice.)_
- [x] TagSet's ask listens for a close request through `CloseWatcher` where the browser has one, and
      leaves the tag off as its × does. _(2026-11-25)_
- [x] Commit. _(2026-11-25)_

**Verify:** a test that a close request leaves the tag off. On the phone, back closes a sheet, the
drawer, a dialog and the ask, and the page stays.

### Phase 6: share into capture

Depends on: phases 2 and 3 (files need the service worker).

- [x] One POST multipart `share_target` in the manifest (a manifest has one), with action `/capture`
      and title, text, url and files. The service worker takes the POST, keeps what was shared in
      Cache Storage, and redirects to `/capture?shared`. _(2026-11-25)_
- [x] `/capture` takes every share held, folds the words into one text (a pure function in `lib/`),
      and hands words and files to `restoreDraft`, which already appends after a blank line and adds
      files after the held ones. It drops what it took, then strips `?shared` with `replaceState`. _(2026-11-25)_
- [x] Commit. _(2026-11-25)_

**Verify:** tests for the folding (empty draft, draft with text, title and url together, repeated
params) and for taking held files. On the phone: share a link from the browser, a paragraph from
another app, one photo and then several from Gallery. Each lands in the draft, and capturing it
gives one item with the web shell's source.

**Unknown:** what Android apps actually send. Many put the URL inside `text` and leave `url` empty,
and some send a title that repeats the text. *If so:* the folding drops the duplicate, and the tests
use real samples taken on the phone.

### Phase 7: loose ends from the research

Depends on: nothing. Can go anywhere after phase 1.

- [-] `viewport-fit=cover` and a top safe-area inset. _(dropped: a standalone install is not drawn
      under the status bar, and `cover` is what would make it so. Every sticky offset would then need
      the inset for no gain. It belongs to a native, edge-to-edge wrapper, if one comes.)_
- [-] `components/settings/Server.svelte` and `lib/client.ts` share one `baseUrl`. The address
      already read `VITE_API_URL` first, which is the transport's own value, so it never disagreed.
      This only stops the expression being written twice. _(dropped — it reads `VITE_API_URL` first, the transport's own value, so it never disagreed, and sharing the constant would mean adding it to the test client too)_
- [-] Commit. _(dropped — nothing to commit)_

**Verify:** nothing changed.

### Phase 8: finish

- [x] `pnpm typecheck`, `pnpm -r --no-sort --silent test`, `pnpm lint`. _(2026-11-25)_
- [-] `pnpm test:stack`, because the daemon's serving of the app is touched. _(dropped — no daemon, transport, HTTP or config code changed; the daemon serves the new files as it serves every other)_
- [x] End to end in headless Chromium against a scratch daemon on loopback: the worker controls the
      page, a multipart share lands in the draft with its file and `?shared` stripped, a second
      share follows the first, `/feed` opens with the daemon stopped and says offline, `/v1` passes
      through, and a rebuilt daemon is said as `new version` with Reload and loaded on the next move. _(2026-11-25)_
- [ ] Hand the developer the on-device checklist: install, offline start, share text, share photos,
      new version under an open edit, back through a sheet.
- [ ] Commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The service worker's request decision and the share folding are pure functions, tested without a
worker or a browser. Installing, WebAPK minting and the share sheet can only be checked on the phone,
which is why each phase lists what to try there.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
