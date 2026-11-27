# Review: What no earlier review covered (PR #134)

**Date**: 2026-11-27
**Status**: Resolved
**Scope**: `git diff 8daabf34..origin/agent/offline-first-start-2`, which is three things. #131's last commit, `1a48ee30` (a replay of `886d2b35`, "opens at once"); #131 up to `bb9ece3e` was covered by [its review](installable-shell-pr-131-2026-11-25.md). #132's 16 commits after its review fixes, `6205018f..6d1a8160`; #132 up to `8daabf34` was covered by [its review](phone-ui-fixes-pr-132-2026-11-25.md). #134's own 8 commits, `3639e8c1..50418895`.
**Plan**: `docs/plans/installable-shell.md` (phase 10), `docs/plans/phone-ui-fixes.md` (the rounds after its review), `docs/plans/offline-first-start.md`
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`, `docs/specs/security.md`

---

## Overall

The range does what its three plans ask, and every spec it changes moves with the code.
Typecheck, lint, `pnpm -r --no-sort --silent test` and `pnpm test:stack` all exit 0 on the
branch. Every `Shipped:` entry the Done plans owe is there. The most important finding is #1, which
#132 and #134 produce together. Behind a VPN that swallows requests, the shell says `offline` within
three seconds, but the queue still draws only its first 25 cached rows until the read it is waiting
on times out, 30 seconds later. #2 is the probe's short timeout reaching every probe rather than
the one at start, which the plan did not ask for.

---

## Bugs

### 1. Offline behind a hanging network, the store is drawn one page short for 30 seconds

`packages/client/src/client.ts:142` (#132, `d29c07d4`), with the probe in
`packages/client/src/client.ts` (#134, `48d28c17`). `listOf` draws a surface held in the cache
only as far as its first page, `PAGE`, until the read either answers or fails. On the phone the
read does neither for 30 s, and the probe saying the pool is out of reach does not count:

```
start under Twingate in flight mode → enter() reads the queue → the request hangs
→ the probe gives up at 3 s, and the drawer says offline
→ page.failure is still undefined → 25 rows are drawn, the rest of the store is not
→ the read fails at 30 s → the whole store is drawn, and the list grows under the reader
```

The offline-first goal is that the shell draws what the device holds. The hanging-network case is
the one it was written for, and it only works in full once the slower timeout catches up.

Fix: draw the whole cache once the client's reach is no as well as on a failure. The client holds
both, so `listOf` can read them together.

---

## Design

### 2. The three-second timeout reaches every probe, not just the one at start

`packages/client/src/client.ts` `askedHealth` (#134, `48d28c17`). The plan gives the probe *at
start* its own short timeout. The code gives it to every probe, and the client probes every ten
seconds that nothing else has answered. On a slow but working network, where `/v1/health` takes
more than 3 s, reach then flips to no and back. Each flip back is a return, which starts a drain and
reads every cached surface again (`onReturn`). The drawer flickers `offline`, and the client spends
requests on a network that was already slow. `client.md` (§ Reachability) now states the
three-second wait generally, so the spec matches the code but not the plan.

Fix: use the short timeout only while reach is not yet known (no mark with a time), and the request
timeout after that. Narrow the spec to match.

---

## Minor

### 3. Signed out, every capture sends the person to the sign-in

`apps/ui/src/routes/capture/+page.svelte` (#134, `193a465d`). `oncaptured` goes to `/`, which is the
sign-in while signed out. A second quick note means opening Capture again from the icon or the
shortcut. Staying on the capture page while signed out would keep capture quick.

### 4. A long list unmounted before its first frame leaves `drawn` unsettled

`apps/ui/src/lib/shown.svelte.ts:51` (#132, `b4f66091`). The cleanup cancels the frame and the timer
but never calls `settle()`, so the `await shown.drawn` in Queue, Feed and Log's `onMount` waits
forever on a surface that is gone. Nothing runs after it that matters, so this is only a held
closure.

### 5. #131's placeholder icon still stands, and merging #134 merges it

`docs/plans/installable-shell.md`, phase 9. "The placeholder icon is replaced" is open, marked as
the developer's before merge. #134 contains all of #131, so it applies here too.

### 6. The row-performance commit says nothing of what the stack brought into it

`3639e8c1` (#134). Replayed onto #132, it carries the combination of #132's width-as-of-the-last-resize
with this branch's crossing-only waking, and `scrollend` added to #132's scroll-mark tests. Its
message describes neither. The PR body does, and history read later will not have it.

---

## Non-issues

- **A session opening drains as well as the start does** — drains are queued, and the second finds
  nothing to send.
- **`following` keeps the child it was attached with** — #132's swipe inserts the uncovered strip
  before the row, but only while swiped, and the row stays what is measured.
- **The draft is drawn on the signed-out capture page** — it is what was typed on this device, which
  is what security.md says the page draws. Pool material (tags, templates, destinations, items) is
  dropped on sign-out by `forgotten`.
- **Unknown reach stays optimistic for actions** — deliberate. It is what finds out, and an unknown
  read as no would flash every start offline. Only the drawer's word waits for it to be known.
- **Link previews do not wait for `known`** — the setting that turns them on comes from the pool and
  is never kept, so by the time it is read, reach is known.
- **`cancellable` always combines the request's own signal** — openapi-fetch gives every request
  one, and keeping it is what lets the probe time out on its own.
- **#132's tag sheet nests a `TagSet`** — the inner one is a `field`, whose `add` focuses its line
  rather than opening another sheet.

---

## Resolution

1. **Fixed** (`20194635`). A cache-drawn surface is drawn whole once the client's reach is no, as
   well as once its read fails. client.md says so beside the rule it amends.
2. **Fixed** (`d2122375`). The probe waits the request timeout only on a steady tick while the pool
   answers. On start, on being looked at again, and while out of reach, it waits three seconds.
   Narrowing it to the start alone, as the plan had it, would have brought the symptom back for a
   shell the phone kept in the background and reopened. client.md is narrowed to match.
3. **Fixed** (`f2ca8a33`). Signed out, the capture page stays drawn after each capture, its field
   cleared for the next.
4. **Won't fix.** Settling `drawn` on unmount would run the surface's after-draw step, which puts
   the scroll back, against whatever page replaced it. A promise whose resolver nothing holds is
   collected with the component.
5. **Won't fix here.** The icon is the developer's to replace, before #134 merges.
6. **Won't fix.** Rewording a pushed commit on a branch with an open PR needs a force-push. This
   review and the PR body record what the commit carries.

