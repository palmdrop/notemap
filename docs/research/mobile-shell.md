# Research: an Android and iOS shell over the existing UI

**Date**: 2026-11-25
**Status**: Draft. Input to a plan, decides nothing.

---

## Verdict

Almost all of `apps/ui` can run unchanged on a phone, and the decision that matters is **where the
UI is loaded from**, not which framework wraps it. Today every shell is a browser on the daemon's
own origin. Specs and code lean on that in four places: the session cookie, `<img>` asset URLs, the
missing CORS headers, and UI and daemon always shipping as the same build. A shell that keeps the
same origin inherits all four for free. A shell that bundles the UI loses all four at once, and it
has to answer each before it works at all.

Recommended order:

1. **PWA first.** The daemon already serves the app. Adding a manifest, a service worker and an
   Android share target gives a home-screen app with offline cold start and share-to-capture on
   Android. Auth stays as it is. The cost is days, not weeks, and every later shape reuses it.
2. **A thin native wrapper that loads the UI from the daemon**, if the PWA turns out to fall short
   on iOS. iOS has no web share target, and a native shell also brings back-button control and
   more durable storage. Still same-origin, so auth, assets and versions stay as they are.
3. **A wrapper that bundles the UI**: only once `/v1` stops changing freely
   ([ADR 9](../adr/0009-versioned-api-mutable-until-first-real-pool.md)), and only if offline cold
   start without a service worker turns out to matter. It is the most work, and it reopens the
   auth questions [security.md](../specs/security.md) has been deferring until "the day a native
   or mobile shell exists".

React Native, Flutter, NativeScript or a native rewrite all discard the Svelte components, so none
of them meets the goal of reusing the UI. They are left out below.

---

## 1. What is already portable

- **The client is a separate package behind two ports.** `@notemap/client` imports no UI
  framework. It reaches the outside only through `Transport` and `ClientStore`
  (`packages/client/src/ports/`). [client.md](../specs/client.md#the-ports--the-seam-for-offline)
  already names "a native shell" as the reason both ports exist.
- **A non-browser shell already exists.** The Raycast extension (`apps/raycast-extension/src/lib/client.ts`)
  builds a client with a bearer token, a configurable daemon URL and the filesystem store. A
  cross-origin, token-carrying client is a path that already runs. Only the rendering half is
  missing.
- **The UI's whole wiring is one file.** `apps/ui/src/lib/client.ts` picks the transport and the
  store. `VITE_API_URL` is already the switch for "not same-origin".
- **The build is a static SPA**: `adapter-static`, `fallback: "index.html"`, `ssr = false`. That
  is the shape every WebView wrapper expects. Fonts ship in `static/`, as ADR 71 requires for
  offline use.
- **Durable offline is already done** in IndexedDB, with an outbox, hydration, leases and a
  reachability probe. Every WebView has IndexedDB.
- **Every browser API in use works in a WebView:** `localStorage` (theme, draft, order, view),
  `sessionStorage` (scroll mark), `navigator.onLine`, `visibilitychange`, `navigator.clipboard`
  (writes only), `URL.createObjectURL`, and `<input type="file" accept="image/*" capture="environment">`.
- **The design is already drawn for a phone first** ([ADR 71](../adr/0071-the-shell-is-drawn-for-a-phone-first-in-blocks-on-three-surfaces.md)):
  docked bars at the foot, sheets, `dvh` units, `safe-area-inset-bottom`, and
  `interactive-widget=resizes-content`.

## 2. What ties the UI to "a browser on the daemon's origin"

The same four points come up for every shape in §3.

| Point | Today | Off-origin, it needs |
| --- | --- | --- |
| **Auth** | `POST /v1/session` sets an `HttpOnly`, `SameSite=Lax` cookie | A bearer token. The only way to get one is signing in for a session and then `POST /v1/tokens`. A token cannot manage tokens or end sessions, so settings → Access degrades. |
| **Assets** | `<img src="/v1/assets/:id/content">` carries the cookie | No header can ride on an `<img>`. Either the daemon serves short-lived signed URLs (security.md owes this) or the shell fetches the bytes and makes object URLs. |
| **CORS** | No headers, which [security.md](../specs/security.md#no-cors-headers-which-is-load-bearing) calls load-bearing | Native HTTP that bypasses the WebView, or CORS for the app's own origin. The second is easier to defend with bearer-only auth and no ambient cookie, but the spec says to reconsider auth first. |
| **Versions** | The daemon serves the UI it was built with | A bundled UI can be older or newer than the daemon. `/v1/health` reports `version` and the client records it, but nothing compares it. Under ADR 9, `/v1` may break at any time. |

Smaller things found along the way:

- `components/settings/Server.svelte` shows `location.host` as the daemon's address. Off-origin,
  it would show the WebView's own origin.
- The filesystem store imports `node:fs`/`node:crypto`, so a WebView can't use it. A native shell
  would use IndexedDB or a new store (SQLite through a plugin). It can't reuse that one.
- `app.html` has no `viewport-fit=cover`, and only `safe-area-inset-bottom` is used. In a browser
  that is fine. A wrapper drawn edge to edge (Android 15 enforces it at target SDK 35) puts the
  header under the status bar unless the top inset is handled too.
- In `+layout.svelte`, `beforeNavigate` uses `location.assign` for a leave that unloads the page.
  That is harmless in a wrapper, but Android's back button and back gesture need deciding: should
  back close an open sheet or drawer first? Whether sheets live in history has not been checked.

## 3. The three shapes

### A. PWA served by the daemon

Needs: a web manifest and icons, a service worker that caches the app shell (SvelteKit's
`$service-worker` module covers this), and the daemon serving both with the right scope. Also a
`share_target` in the manifest that lands on `/capture` with text, title and url prefilled. GET
covers text and links. Shared files need POST, which the service worker has to intercept. HTTPS is
required, and the daemon already supports it behind a proxy or tunnel through `daemon.origin`.

Gets: an installed app on both platforms and an offline cold start. On Android, the app appears in
the share sheet. Nothing about auth, CORS, assets or versions changes.

Misses: **iOS has no Web Share Target.** WebKit bug 194593 has been open since 2019 and nothing has
shipped. An iOS Shortcut that posts to `/v1` with a token appears in the share sheet and works
today, but it is online-only and bypasses the outbox. There is also no hardware back-button
control, and no background drain.

### B. Native wrapper loading the UI from the daemon

The WebView navigates to the daemon's URL, so the UI is the one the daemon serves. Native plugins
add a share target, back-button handling, status-bar and keyboard behaviour.

Gets: everything A gets, plus share-to-capture on iOS through a Share Extension. Still same-origin.
No skew, because the UI updates whenever the daemon does.

Costs and risks:
- Offline cold start depends on A's service worker running inside the WebView. On iOS, WKWebView
  only allows service workers for App-Bound Domains. Verify this before relying on it.
- Capacitor documents `server.url` as meant for live reload and "not for production". The warning
  is guidance, not a hard block. The real risk is App Store review rejecting an app that isn't
  self-contained. For a self-built or sideloaded app it hardly matters, but it is a decision about
  distribution.
- The daemon URL is fixed at build time unless a small bundled launcher picks it and navigates.
  Whether plugins still work after that navigation needs checking for the chosen framework.
- The native bridge is exposed to whatever the daemon serves. It is your own daemon, so this is
  acceptable, but say so in the security spec.
- iOS share extensions run in their own process. The extension either writes the shared item to an
  App Group container for the app to pick up, or posts straight to `/v1` with a token. The first
  keeps everything in the outbox.

### C. Native wrapper with the UI bundled

Gets: offline cold start with no service worker, no dependency on the daemon to draw anything, and
the most "app-like" result.

Costs: every row of the §2 table. Concretely:
- a sign-in flow that mints a token and keeps it in secure storage
- a transport over native HTTP
- signed asset URLs in the daemon (or object URLs in the shell)
- a daemon-URL setting
- a version check that refuses to talk to an incompatible daemon
- a decision about CORS

One more risk, from a forum report on Capacitor 7 (not verified here): with native HTTP on Android,
uploading a large `File` body crashed the app. Uploads go through
`PUT /v1/assets/{id}` with a `File` body, so this needs a test early.

## 4. Capacitor or Tauri (for B or C)

Both wrap the same static build in the system WebView, and both have a plugin that receives shares
on Android and iOS: `@capgo/capacitor-share-target` and `tauri-plugin-mobile-sharetarget`. On iOS,
both need a Share Extension target added in Xcode.

- **Capacitor**: built for mobile first. Its plugins for back button, keyboard, status bar,
  preferences and secure storage are mature. The toolchain is Node plus Android Studio and Xcode,
  so no new language. Its native HTTP works by patching `fetch`. The patch has limits on binary
  bodies, and the Android crash report above is one of them. A `Transport` written against the
  plugin directly avoids relying on the patch.
- **Tauri 2**: one framework for desktop and mobile, and it is the name the docs already use
  (`CONTEXT.md` "Shell", client.md, [ADR 5](../adr/0005-typescript-now-rust-later.md)). Its mobile
  plugins are fewer and younger, and it adds Rust and the Android NDK to the toolchain. For a remote
  URL to reach the native bridge, it has to be granted capabilities.

For a phone-only shell, Capacitor is the lower-risk choice. If a desktop build is coming anyway,
Tauri's single codebase is worth the thinner mobile ecosystem. Choosing Capacitor means changing
the "Shell" entry in `CONTEXT.md`, and that choice deserves an ADR.

## 5. UI work every shape shares

- **Capture prefill from outside**: `/capture` accepting text, title, url and files. The PWA share
  target and both native plugins all land here.
- **Top safe-area inset** and `viewport-fit=cover`.
- **Back closes the innermost thing**: sheet, then drawer, then route.
- **A platform seam** that stays inside `lib/client.ts`: it picks transport and store per shell and
  passes nothing down to components. `Server.svelte` reads the address from the transport, not
  from `location`.

## 6. Questions for the plan

1. **Distribution.** Self-built and sideloaded, TestFlight, or the stores? Shape B fits only the
   first two.
2. **How much does iOS share-to-capture matter?** It is the only thing A cannot do that B can. If
   an iOS Shortcut is enough, A may be the whole answer for now.
3. **Is a desktop app planned?** That decides Capacitor or Tauri.
4. **Is `/v1` close to stable?** If not, C means a version handshake, and the bundled app breaks
   whenever the daemon moves ahead of it.
5. **Signed asset URLs**: build them now as daemon work (needed for C, useful for Raycast), or
   leave them until C is chosen?

## 7. Answers, 2026-11-25

1. Built by the developer and sideloaded, maybe F-Droid later. **Android only for now.**
2. An iOS Shortcut is enough for iOS for now.
3. A desktop app is not planned. The web UI is probably enough.
4. `/v1` is mostly stable, not entirely.
5. No signed asset URLs yet. The developer will implement them, with guidance, and no agent does it
   unattended ([todo](../todo.md)).

Next: shape A, in [the installable-shell plan](../plans/installable-shell.md).

---

## Sources

- [WebKit bug 194593: Web Share Target](https://bugs.webkit.org/show_bug.cgi?id=194593)
- [firt.dev: iOS PWA compatibility](https://firt.dev/notes/pwa-ios/)
- [web.dev: Web Share API and share target](https://web.dev/articles/web-share)
- [Capacitor Http API (fetch patching, Blob bodies)](https://github.com/ionic-team/capacitor/blob/main/core/http.md)
- [Capacitor config docs: `server.url`](https://capacitorjs.com/docs/v6/config)
- [Ionic forum: App Store and `server.url`](https://forum.ionicframework.com/t/apple-app-store-approval-issue-with-this/199417/5)
- [Ionic forum: large upload crash on Android with CapacitorHttp](https://forum.ionicframework.com/t/large-video-upload-crashes-on-android-with-capacitorhttp-enabled-but-works-on-ios/251733)
- [@capgo/capacitor-share-target](https://capgo.app/docs/plugins/share-target/getting-started/)
- [Capawesome share target (Insiders only)](https://capawesome.io/plugins/share-target/)
- [tauri-plugin-mobile-sharetarget](https://docs.rs/crate/tauri-plugin-mobile-sharetarget/latest)
