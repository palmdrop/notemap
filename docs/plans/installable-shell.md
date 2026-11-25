# An installable shell, on Android first

**Date**: 2026-11-25
**Status**: Todo
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

- [ ] Create branch `agent/installable-shell`.
- [ ] `shell.md`: describe the installed shell. It installs, it starts offline, share lands in the
      draft (with decisions 4 and 5), back closes the innermost overlay, and the status line says
      when a new version is ready. Put "the service worker never answers `/v1`" in Constraints.
- [ ] `security.md`: the service worker's scope and what it does not touch (`/v1`, `/docs`). The
      share target takes nothing from another app until the person captures it. Also the WebAPK
      round trip from decision 1.
- [ ] `CONTEXT.md`: add a term only if the spec text needs one it lacks. Check "Shell" still
      describes this.
- [ ] Get the developer's confirmation on the doc changes before any code.
- [ ] Commit.

**Verify:** the developer has read and confirmed the diff.

### Phase 2: a manifest

Depends on: phase 1.

- [ ] A web manifest in `apps/ui/static/`: name, short name, start URL, scope, `display:
      standalone`, theme and background colours from `tokens.css`, icons at 192 and 512, plain and
      maskable. Linked from `app.html`, along with `theme-color`.
- [ ] Check what `apps/daemon/src/ui/serve.ts` answers for the manifest and icons: media type
      (`.webmanifest` is already mapped), `no-cache`, open without a session. Add a daemon test if
      something there changes.
- [ ] Commit.

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

- [ ] A service worker through SvelteKit's `$service-worker` module. Precache the build and
      `static/` (fonts, icons, manifest) under a cache named for the build's version, and drop
      older caches when it activates.
- [ ] Requests: navigations go to the network first, falling back to the cached shell. Precached
      files come from the cache. Anything under `/v1` or `/docs`, and anything not same-origin,
      passes through untouched. Keep that decision in a pure function, tested alone.
- [ ] Decide whether it registers in `vite dev`. *Proposal:* not in dev, so a stale worker never
      hides a change while developing.
- [ ] Commit.

**Verify:** unit tests of the request decision. With a production build served by the daemon,
install on the phone, stop the daemon, close the app and reopen it. The shell draws from the client's
store and says `offline`, and a capture lands in the outbox and drains once the daemon is back.

**Unknown:** whether a `no-cache` `index.html` fallback plus SvelteKit's hashed `_app/immutable`
files is enough, or whether the daemon has to send `Service-Worker-Allowed` or other headers.
*If more is needed:* the change goes in `serve.ts`, with a daemon test.

### Phase 4: a new version

Depends on: phase 3.

- [ ] Set `kit.version.name` to the release version the daemon reports, so `$service-worker`'s
      `version`, `_app/version.json` and `/v1/health` agree.
- [ ] Turn on SvelteKit's `updated` polling. The status line says a new version is ready and offers
      a reload. The reload goes through the same unsaved-edit guard as `beforeNavigate` in
      `+layout.svelte`.
- [ ] Commit.

**Verify:** tests for the status line's new state and for the guard holding a reload. On the phone:
install, rebuild the daemon at a new version, and see the notice. With an edit open, nothing reloads
until it is saved or left.

**Unknown:** whether the polling interval and the status line's existing tempo clash (ADR 74: it
shows while something is true). *If they do:* the notice reads the version reachability already
carries from `/v1/health` instead of polling a second file.

### Phase 5: back closes the innermost thing

Depends on: phase 1. Independent of phases 2 to 4.

- [ ] Inventory everything that opens over a page: `primitives/sheets/Sheet.svelte`,
      `Dialog.svelte`, `frame/Drawer.svelte`, and any panel drawn without them (`status/Panel`,
      `tags/FilterPanel`, `log/Views`).
- [ ] Opening one pushes a shallow history entry (`pushState` with `page.state`). Back pops it and
      closes it through the same path Escape takes. Closing it any other way removes the entry, so
      back does not land on a closed sheet. This lives in the primitives, not in each user of them.
- [ ] Check it alongside `lib/trail.svelte.ts`, which already keeps state in `page.state`.
- [ ] Commit.

**Verify:** component tests with `src/testing/router.ts`: open a sheet, go back, the sheet is closed
and the route unchanged. Close by the button, go back, the route goes back. On the phone, the back
gesture does the same in the installed app.

### Phase 6: share into capture

Depends on: phases 2 and 3 (files need the service worker).

- [ ] Text and links: a GET `share_target` in the manifest, with action `/capture` and title, text
      and url params. `/capture` reads them once and folds them into the draft as decision 4 says.
      Then it strips them with `replaceState`, so a reload does not add them twice. Keep the folding
      in a pure function in `lib/`, tested alone.
- [ ] Files: a POST multipart `share_target`. The service worker intercepts the POST, keeps the files
      where the page can read them, and redirects to `/capture` with a marker. The page takes the
      files into the held files (`lib/draft.ts`), and the worker's copy is dropped once taken.
- [ ] Commit.

**Verify:** tests for the folding (empty draft, draft with text, title and url together, repeated
params) and for taking held files. On the phone: share a link from the browser, a paragraph from
another app, one photo and then several from Gallery. Each lands in the draft, and capturing it
gives one item with the web shell's source.

**Unknown:** what Android apps actually send. Many put the URL inside `text` and leave `url` empty,
and some send a title that repeats the text. *If so:* the folding drops the duplicate, and the tests
use real samples taken on the phone.

### Phase 7: loose ends from the research

Depends on: nothing. Can go anywhere after phase 1.

- [ ] `viewport-fit=cover` in `app.html`, and the header honouring `safe-area-inset-top`. Inside a
      standalone install this changes nothing until a display mode draws under the status bar, so it
      is checked rather than assumed.
- [ ] `components/settings/Server.svelte` reads the address from the client's transport
      (`baseUrl`), falling back to `location.host` only when that is empty. Today the answer is the
      same, and the change stops it lying in any shell that is not same-origin.
- [ ] Commit.

**Verify:** a test for the address with an empty and an absolute `baseUrl`. On the phone, the header
and the foot bar are clear of the status bar and the gesture bar.

### Phase 8: finish

- [ ] `pnpm typecheck`, `pnpm -r --no-sort --silent test`, `pnpm lint`.
- [ ] `pnpm test:stack`, because the daemon's serving of the app is touched.
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
