# The shell starts offline-first

**Date**: 2026-11-27
**Status**: Done
**Spec**: `docs/specs/shell.md`, `docs/specs/client.md`, `docs/specs/security.md`
**Closed**: 2026-11-27

---

## Goal

On the developer's Android phone, with Twingate running and flight mode on, the installed shell draws
the queue the device holds and takes a capture the moment it opens, and says `offline` within about
three seconds. A capture made while signed out is held and sent once anyone signs in.

---

## Context

Found on the device after [installable-shell](installable-shell.md) shipped its flight-mode fix.
The drawer said `online` and `no password set`, and nothing was drawn under the header. Reproduced in
headless Chromium against a scratch daemon:

- **Twingate keeps `navigator.onLine` true in flight mode, and a request hangs instead of failing.**
  The client's reach starts as `yes` and only flips when a request fails, which a hung one does at
  the 30 s timeout. Until then the shell says `online`.
- **Every page waits on knowing who is signed in.** The layout draws its page only once the session
  is known. Offline, that comes from the answer kept in `localStorage`, and with none kept nothing
  is drawn at all, the capture page included. `no password set` is what the drawer says for a
  session that is not known yet.
- The emulated flight mode the earlier check used fails every request at once and reports itself
  offline, so it passed.

Decided with the developer on 2026-11-27:

1. **Nothing waits.** The shell draws and takes input before it knows whether it is online or who
   is signed in. Sign-in is drawn only on a definite signed-out answer. The capture page is never
   behind it.
2. **Reach starts unknown.** A health probe at start with a short timeout of its own decides it.
   The browser saying offline decides it at once.
3. **Signed out, the installed shell still captures.** What it captures waits in the outbox and is
   sent to whichever account signs in next. Nothing checks it is the same account: losing the notes
   is worse than sending them to the wrong one, on a pool with one person.

**Out of scope:**

- Link previews offline. Already done on `agent/row-performance` (no block drawn, nothing asked).
- Account-aware draining, or asking before sending held captures to a different account.
- The browser tab. It keeps today's behaviour when signed out (decision 3 is the installed shell's).

---

## Tasks

### Phase 1: the docs

Depends on: nothing.

- [x] Create branch `agent/offline-first-start`, from `agent/row-performance`.
- [x] `shell.md`, *Installed on a phone* and *Reachable, pending, refused*: the shell draws from the
      store at once, and the status line and drawer say nothing about reach or who is signed in
      until they are known. Replace "With nothing kept, the shell waits, as before."
- [x] `shell.md`, the login: drawn only on a definite signed-out answer, kept or fresh. On the
      installed shell, the capture page is open while signed out and says its captures are held
      until someone signs in. Amend the 2026-08-31 "a login, and nothing behind it" rule rather than
      erase it.
- [x] `client.md`: reach has a third state, unknown, until the first probe or answer. A probe at
      start, timing out on its own short clock rather than the request timeout.
- [x] `security.md`: whoever holds the unlocked phone can queue a capture while signed out, and it
      lands under whoever signs in next.
- [-] `CONTEXT.md`: only if the spec text needs a word it lacks. _(dropped — none needed)_
- [-] Get the developer's confirmation on the doc diff. _(dropped — the developer said to implement; the branch is the confirmation, before merge)_
- [x] Commit.

**Verify:** the developer has read and confirmed the diff.

### Phase 2: reach starts unknown

Depends on: phase 1.

- [x] Reach is unknown until the first answer or failure, which the client already marks as a
      mark with no time. The shell reads it as `known`. What acts on reach keeps the client's
      optimistic `yes`, since that is what finds out, and an unknown read as `no` would draw every
      start offline for a moment. What says something about reach waits for `known`: the drawer's
      word. The browser saying offline is known at once.
- [x] The health probe at start gets a timeout of its own (3 s), and a request's own abort signal
      is kept alongside the client's. A probe that times out reads as `offline`. A later answer
      still flips it back.
- [x] The status line and the drawer draw nothing for reach while it is unknown.
- [x] Commit.

**Verify:** client tests for the three states and the probe's timeout; UI tests that an unknown
reach draws neither word. `/tmp/nm-loop/loop.mjs` with `MODE=hang` says `offline` within about
3 s, not 30. `pnpm test:stack`, since the client's transport is touched.

**Unknown:** whether a probe that times out also has to cancel the 30 s requests already waiting.
*If they hold anything up* (the outbox's lease, a drain), cancel them too when the probe times out.

### Phase 3: nothing waits on the session

Depends on: phase 1. Independent of phase 2.

- [x] The layout draws its page while the session is unknown, from the store. Only a known
      signed-out answer draws sign-in.
- [x] The drawer says nothing for who is signed in while it is unknown, rather than
      `no password set`.
- [x] Commit.

**Verify:** layout tests: no session answer and no kept answer draws the queue from the store and
the capture page; a kept signed-out answer draws sign-in. `loop.mjs` with `NOKEPT=1` in both
`offline` and `hang` modes draws the queue.

### Phase 4: capture while signed out, on the installed shell

Depends on: phase 3.

- [x] On the installed shell, the capture page is reachable while signed out, and a capture made
      there goes to the outbox. It says it is held until someone signs in.
- [x] Check the outbox already holds through a `401` and drains when a session opens (client.md
      says it does). _(2026-11-27: it held, and did not drain on signing in: only a return of
      reach, a mutation or a restart drained it. A session opening now drains.)_ Add a test for a capture made signed out landing after sign-in as another
      account.
- [x] Commit.

**Verify:** tests for the capture page while signed out, installed and not; the client test above.
On the phone: sign out, flight mode, capture, sign in, and the capture lands.

**Unknown:** how the shell tells it is installed. *Expected:* `display-mode: standalone`, which a
WebAPK launch should report. *If it does not:* the developer decides whether the tab gets this too,
which would remove the check.

### Phase 5: finish

- [x] `pnpm typecheck`, `pnpm -r --no-sort --silent test`, `pnpm lint`, `pnpm test:stack`.
- [x] `loop.mjs` in every mode (`offline`, `hang`, `stopped`, `lapsed`, each with and without
      `NOKEPT=1`): the queue is drawn and reach is right within 3 s, or sign-in where signed out.
- [x] Hand the developer the on-device checklist: flight mode with Twingate, open from the icon and
      from the Capture shortcut, capture, come back online, signed-out capture.
- [x] Commit.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The device's flight mode cannot be emulated by Chromium's offline switch. Test reach with requests
that hang, not only ones that fail.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
