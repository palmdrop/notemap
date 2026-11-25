# Review: The installable shell (PR #131)

**Date**: 2026-11-25
**Status**: Resolved
**Scope**: `apps/ui/src/service-worker.ts`, `apps/ui/src/lib/worker/`, `apps/ui/src/lib/sharing/`, `apps/ui/src/routes/+layout.svelte`, `apps/ui/src/routes/capture/+page.svelte`, `apps/ui/src/components/primitives/controls/TagSet.svelte`, `apps/ui/static/manifest.webmanifest`, `docs/specs/shell.md`, `docs/specs/security.md`
**Plan**: `docs/plans/installable-shell.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/security.md`

---

## Overall

The worker does what the plan asks, and the invariant that matters most holds by construction: the
worker answers from cache only for exact paths in `kept`, plus the shell for navigations after the
network has had its chance. Nothing under `/v1` or `/docs` can come from a cache. Typecheck, lint
and `pnpm -r --no-sort --silent test` are green. The weak point is the share path. Shares sit in
durable Cache Storage, and the capture page deletes them before the draft write is confirmed, then
moves their files into module memory. From there the next document load drops them, and the next
share causes one (#1, #2). Reload ignores held attachments, although `losing()` counts them (#3).
The share target also takes form posts from any website, and security.md does not name that (#4).
Shipped trail: the plan is **In progress**, and both specs carry a dated `Shipped:` entry, so
nothing is missing.

---

## Bugs

### 1. A share is deleted before the draft accepts it

`apps/ui/src/lib/sharing/held.ts:121`, `apps/ui/src/lib/sharing/into-draft.ts:12-14`,
`apps/ui/src/routes/capture/+page.svelte:22`. `takeShares` deletes every part it reads.
`restoreDraft` runs after that and can still answer `unwritable`, and on `unwritable` it also skips
the files (`draft.ts:130` returns before `files = [...]`).

```
share held → takeShares deletes it → restoreDraft: localStorage refuses → "unwritable"
→ notice "could not keep what was shared" → words and files are gone from both places
```

The same happens if `takeShares` throws partway, for example on a bad `response.json()` at
`held.ts:109`. Earlier shares are already deleted, and the words gathered so far are lost with the
exception. The notice says "could not keep", but the share is already gone, not just refused.

Fix: take in two steps. Read the shares, write the draft, and delete only what `restoreDraft`
accepted.

### 2. Shared files survive only until the next page load, and the next share is a page load

`apps/ui/src/lib/sharing/into-draft.ts:14`, `apps/ui/src/lib/draft.ts:79`. On mount, the capture
page moves every held file out of Cache Storage and into a module variable. A share is a POST
navigation to `/capture`, then a 303 to `/capture?shared`, so the page is a new document.

```
share photo A → /capture mounts → A moved into memory, cache emptied
share photo B (Chrome reuses the app window) → document unloads → A gone
→ only B is in the draft
```

This breaks the spec's "added to the end of the draft … Nothing is overwritten" (`shell.md:3780`).
The common phone flow is to open Gallery to share a second photo, and Android may kill the
backgrounded app on the way, which loses A the same way. Text survives because it is in
localStorage. The PR's "a second share follows the first" check does not say whether the first
share had files. The same unload drops an open edit with changes on `/feed` when a share arrives.
Whether Chrome reuses the window for a share launch is a device question, and it belongs on the
"Not yet verified" list.

Fix: keep shared files in Cache Storage until the capture that carries them is sent or discarded,
instead of draining them into memory on mount.

### 3. Reload drops held attachments without asking

`apps/ui/src/lib/worker/version.svelte.ts:46-47`. `reload()` goes through `leave()`, which checks
only the open edit. `losing()` (`:32`) treats held files as something a reload loses, and
`loadInstead` respects that. The **Reload** button does not, so tapping it with a shared photo held
(or any attachment not yet captured) throws the photo away with no question. The plan says the
reload goes through the unsaved-edit guard, and the spec's "does not reload … while anything is
unsaved" implies attachments count. `version.svelte.test.ts` covers Reload behind an edit, but not
Reload with files held.

Fix: guard `reload()` on `losing()` as well, and ask, or say why it is waiting.

---

## Design

### 4. Any website can post a share, and security.md does not say so

`apps/ui/src/lib/worker/answer.ts:30`, `docs/specs/security.md:756`. The share is recognised by
method and path alone. A form on any site that POSTs to `https://<daemon>/capture` gets intercepted
by this worker, whatever started the request. That includes a top-level auto-submit or a hidden
`<iframe>`: the worker holds the post before any framing rule applies. `SameSite=Lax` plays no part
because the request never reaches the daemon. The next time the person opens capture, the attacker's
text and files (`accept: */*`) are appended without a word, since success raises no notice. If the
person does not read to the end of the draft or check the attachment row, they get sent along with
the person's own capture. The same open door can also fill this origin's quota (see #7).

security.md lists what is undefended, and its section on cross-site `POST` is thorough. This new
surface needs the same treatment there. The current text says "what another app shared", which
reads as if only the system share sheet can deliver a share. Cheap mitigations to weigh:

- say on arrival what was added
- refuse a share whose `request.destination` is not `document`, which closes the silent iframe path
- cap the size of a share

### 5. `loadInstead` on back pushes a new history entry

`apps/ui/src/routes/+layout.svelte:159`. On a `popstate` move, the browser has already gone back by
the time `beforeNavigate` runs. Assigning `location.href` then pushes the earlier URL again and
cuts off forward history. The result is `[/a, /a]`, so the next back appears to do nothing. That is
noticeable with the Android back gesture, and with the spec's Previous/Next history entries. The
client-side navigation is also not cancelled, so the old build's router keeps going in parallel with
the full load. Fix: `navigation.cancel()` for link and goto moves. For a popstate move, reload in
place rather than push.

### 6. The cutover strands a page drawn from the old shell

`apps/ui/src/service-worker.ts:25,35`. `skipWaiting` plus `clients.claim` plus deleting older
`notemap-shell-*` caches on activate means a page still running the old build loses its cached
route chunks it has not loaded yet. A page served from cache after the 4 s timeout is the realistic
case. The new worker does not list those paths in `kept`, so they go to the network. Online, the
daemon answers 404 (`serve.ts:89`), and SvelteKit's update check on a failed navigation should
recover with a full load. Offline, the route just fails. The window is narrow, but it is the offline
path this feature exists for.

### 7. A failed share has no way out, and partial shares never get cleaned up

`apps/ui/src/service-worker.ts:62`. If `request.formData()` or a quota error in `holdShare`
rejects, the promise passed to `respondWith` rejects too. The person sees the browser's network error
page, the share is lost, and the shell never gets to show a notice. A `holdShare` that fails after
writing some files leaves file parts with no `words` entry. `takeShares` skips those as "still
arriving" (`held.ts`, the docstring on `takeShares`) every time after that, and nothing ever sweeps
them. Fix: catch in `share()`, still redirect, let the page say the share failed, and drop parts
with no words that are older than some bound.

---

## Minor

### 8. "Nothing it holds outlives a sign-out" is not true of shares

`docs/specs/security.md:754`. The next bullet says the worker holds shares, and a held share
outlives a sign-out the way the localStorage draft does. Limit the claim to the pool, or say that
shares, like the draft, stay on the device.

### 9. The navigation timeout keeps running while the body arrives

`apps/ui/src/service-worker.ts:51`. `AbortSignal.timeout(WAITED)` keeps running after `fetch`
resolves, so a page whose body is still streaming at 4 s gets cut off mid-document. `index.html` is
small, so this is unlikely to fire.

### 10. `version.svelte.ts` uses no runes, and `lib/worker/` mixes two contexts

`apps/ui/src/lib/worker/version.svelte.ts`. Nothing in the file needs the `.svelte.ts` suffix. The
folder also holds code that runs in the worker (`answer.ts`) next to code that runs in the page
(registering the worker, version checks, `loadInstead`). A reader cannot tell from the folder which
side a file runs on.

### 11. "Share" as a noun is not in CONTEXT.md

The specs now say "a share is held" and "a share that repeats itself". The plan dropped its
CONTEXT.md task because no new term seemed necessary, but this is a new term.

### 12. Tests stop short of the glue

The worker's `page()` fallback (timeout, 5xx) and `share()` redirect have no tests outside the
manual headless run. Neither has the capture page's `onMount` (the `unwritable` notice, stripping
`?shared`). `into-draft.test.ts` has no `unwritable` case, which would have caught #1.

### 13. One bad held share blocks every later one

`apps/ui/src/lib/sharing/held.ts:109`. A `words` entry that does not parse throws before anything
is deleted. Ids sort by time, so it is first in line on every mount, and every share after it stays
stuck behind it.

### 14. The placeholder icon is still in

Decision 3 says the developer replaces it before merge, so by the plan's own terms this blocks the
merge.

---

## Non-issues

- **`/v1` and `/docs` can be reached through an encoded path that `theDaemons` does not match.**
  This only affects navigations, which still go to the network first. A cache answer is only ever an
  exact `kept` path or the shell.
- **The worker updates partway through a share.** `notemap-shares` has no version in its name, so
  activate never deletes it, and an in-flight `respondWith` finishes in the old worker.
- **A share arrives while the page is reading.** The files are written before the words, and the
  words mark a share as complete, so `takeShares` never takes half of one.
- **`updated.check()` behind the worker.** `_app/version.json` is not in `$service-worker`'s
  `build`, so it always goes to the network.
- **Re-fetching a navigation request with an init.** The mode becomes `same-origin` and redirect
  stays `manual`. An opaque redirect (status 0) passes `answered` and is a valid navigation response.
- **4xx counts as answered.** The daemon answers every app path with the shell, so a 4xx is a real
  answer.
- **No history entry per sheet.** Chrome on Android sends back to modal `<dialog>`s as a close
  request. A history entry would close the sheet twice.
- **Signed asset URLs.** Out of scope by the plan. Nothing here needs them: the installed shell, and
  a TWA fallback, are both the daemon's origin. They matter only for a shell that is not served from
  the daemon's origin.

---

## Resolution

*2026-11-25.* All but #14 resolved on the branch; phase 9 of the plan.

1. Shares are read without being let go of; the words go once the draft holds them.
2. A shared file is kept in the worker's cache until the draft lets go of it, and put back into the
   draft on the next page.
3. Reload waits for held attachments and says so.
4. A share that is not a page is refused; one that lands says `Added what was shared, at the end.` over the capture page's bar.
   security.md names the share target as a door any site can knock on, and what is undefended.
5. Back or forward loads the newer build where the browser went; a link cancels the old move.
6. A new build keeps the cache of the build before it, and answers that build's files from it.
7. A share that cannot be held still redirects, with `?shared=failed`, and the page says so. A share
   whose words never arrived is swept after a day.
8. The claim is narrowed to the pool's material.
9. The wait is cleared once the head arrives.
10. The page-side code is `lib/installed/version.ts`, with no `.svelte`.
11. `Share` is in `CONTEXT.md`.
12. Tests for `page`, `share`, `stale` and the capture page's notices; `into-draft` covers
    `unwritable`.
13. A share that cannot be read is dropped, and the ones after it are read.
14. Open: the developer's, before merge.

