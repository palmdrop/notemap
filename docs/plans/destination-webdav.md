# A webdav destination kind

**Date**: 2026-08-26
**Status**: Todo
**Spec**: `docs/specs/core.md`, `docs/specs/security.md`
**Closed**:

---

## Goal

A `webdav` destination kind, so an item routed at a Nextcloud vault arrives as a markdown note that
Nextcloud already knows about — no `occ files:scan`, no shared volume, no uid to align. It creates
a note without ever overwriting one, appends to an existing note without losing a concurrent write,
puts an item's assets beside it, and writes the same markdown the filesystem kind writes, because
the two kinds must not drift into two dialects of the same note.

Decided 2026-08-26, against writing into Nextcloud's data directory: that is unsupported by
Nextcloud, needs an `occ` the daemon has no business being able to run, and leaves files owned by
the wrong uid.

Enumerating what is already in the vault is **not** in this plan
([destination-targets](destination-targets.md)). This one delivers to a path a person supplies.

`/v1` does not change. `GET /v1/destination-kinds` publishes each kind's settings schema and
`describe()` answers capabilities live, so a new kind reaches the composer without a route being
touched — which is the arrangement [ADR 20](../adr/0020-destinations-are-pool-state.md) bought.

---

## Tasks

### Phase 1 — the note format stops belonging to the filesystem

Depends on nothing. Nothing behaves differently when this phase lands.

- [ ] Create branch `agent/destination-webdav`
- [ ] A new package holds what turning a `Delivery` into a markdown note is, independent of where
      the note goes: the renderers, the fixed frontmatter and its reserved keys, the derived
      filename, `insertUnder`, and the two generic name helpers `oneSegment` and `alternatives`.
      **Proposed name: `@notemap/delivery-markdown`** — it renders a delivery, and `note` is a word
      [CONTEXT.md](../../CONTEXT.md) tells us to avoid. Confirm the name before the directory exists
- [ ] What stays in `@notemap/destination-fs` is what is genuinely about a filesystem: containment
      against a real root through symlinks, and the temporary-then-`link` placement
- [ ] `apps/daemon/src/destinations/renderers.ts` imports from the new package. The renderers are
      still the host's — which payload types exist is not the adapter's business
- [ ] Verify: `pnpm -r --silent test` and `pnpm -r typecheck` green with **no test changed**. A
      passing suite after a pure move is the whole evidence this phase offers

### Phase 2 — where the password lives

Depends on nothing. Settle it before any code assumes an answer.

- [ ] **The problem, verified 2026-08-26**: a destination's settings are pool state. They are
      returned by `GET /v1/destinations` on an API with no authentication, and the mirror writes
      them verbatim — `pool-mirror/destinations/<id>.json` holds the settings object as it stands.
      A Nextcloud app password put in `settings` is therefore plaintext on disk in the backup, and
      readable by anything that can reach `/v1`
- [ ] **The second problem, which decides the shape**: a destination is created over `/v1`, and the
      settings name a URL the daemon will then send an authenticated request to. Whoever can create
      a destination can therefore aim the daemon at any address it can reach — another container, a
      loopback service, a host of their choosing — and have it deliver *with the credential
      attached*, repeatedly, on the delivery runner's own timer. That is server-side request forgery
      with credential disclosure at the end of it, and it does not exist today only because every
      kind is local and contained. [login-and-access-tokens](login-and-access-tokens.md) shuts the
      outer door; this still has to hold with somebody signed in
- [ ] **Proposed shape**: the host's config declares named credential **profiles**, each carrying a
      base URL *and* its secret, resolved together. A destination's settings choose a profile by
      name and a path within it — never a URL, never a secret. So a credential cannot be redirected
      by editing a destination, and nothing secret enters the pool or the mirror. This is what
      [core.md](../specs/core.md) already says is the host's: it reads config and secrets, core
      evaluates
- [ ] This narrows [ADR 20](../adr/0020-destinations-are-pool-state.md) and the ADR has to say so:
      destinations stay pool state — created, renamed, retired and deleted over the API, mirrored,
      restored by a rebuild — but for a kind that holds a credential, *which endpoint* is no longer
      a person's free-text field. Argue with that before building on it
- [ ] Redirects are not followed with a credential attached, and TLS verification is never disabled.
      Both are one line to get wrong and neither is visible afterwards
- [ ] The adapter is constructed in `apps/daemon/src/ports.ts` and closes over the resolver, so
      neither core nor the pool ever holds the secret
- [ ] Record it as an ADR: the reasoning is not obvious from the code, and the next kind that needs
      a token will face the same question
- [ ] A credential that will not resolve is **not** `unusable` — the settings satisfy the schema.
      `describe()` still answers, doing no I/O, and the delivery reports `unreachable` naming what
      it could not read, on the same terms as an unmounted drive
- [ ] Verify: the ADR is written and confirmed; `pnpm lint` green
- [ ] `git commit`

### Phase 3 — the kind, and the paths it will accept

Depends on phases 1 and 2.

- [ ] `packages/adapters/destination-webdav`, exporting `createWebdavDestination`. Settings schema:
      base URL, username, credential reference. The base URL names a collection — for Nextcloud,
      `https://…/remote.php/dav/files/<user>/<vault>` — and that collection is the root
- [ ] `describe()` touches the network for nothing, exactly as the filesystem kind refuses to touch
      the disk: an unreachable Nextcloud must still be routable, with the record made and the
      delivery deferred. That property is why deferred delivery works at all
- [ ] The capabilities are named `create-file` and `append-to-file`, the filesystem kind's own
      names, with the same target shapes. Two kinds that do the same thing under different words
      would make every rule and every composer choice kind-specific for no gain
- [ ] Containment is a string rule here — resolve the target against the root and refuse anything
      that leaves it. There are no symlinks to chase, so the filesystem kind's second check has no
      counterpart, and paths are percent-encoded per segment: vault folders have spaces in them
- [ ] Tests: an in-process DAV server standing in for Nextcloud, so the suite needs no instance.
      It is a fake, and phase 7 is what proves the fake was honest
- [ ] Verify: `pnpm -r --silent test`
- [ ] `git commit`

### Phase 4 — creating without overwriting

Depends on phase 3.

- [ ] `PUT` with `If-None-Match: *`, which is the request that means *only if it is not there*. A
      `412` is the name being taken, and the answer is the `alternatives()` suffixing the filesystem
      kind already does — `name`, `name-1`, `name-2` — rather than a refusal
- [ ] Missing collections are created with `MKCOL`, level by level: Nextcloud will not make a parent
      for a `PUT`. A collection that already exists answers `405`, which is success here
- [ ] The pointer stored on the routing record is the path relative to the root, in URL separators,
      so it reads the same as the filesystem kind's
- [ ] Tests: a create against a taken name lands beside it; a create into a folder three levels deep
      that does not exist makes the folder; two creates racing produce two files and never one
- [ ] Verify: `pnpm -r --silent test`
- [ ] `git commit`

### Phase 5 — appending without losing a write

Depends on phase 4.

- [ ] `GET` the note and keep its `ETag`, insert under the heading with the shared `insertUnder`,
      then `PUT` with `If-Match: <etag>`. Without the condition, two appends a second apart lose
      one silently — which is the failure mode this kind has and the filesystem kind does not,
      since `link` and `rename` do that work in the kernel
- [ ] A `412` means somebody else wrote in between. Re-read and try again, a small bounded number of
      times, then answer `unreachable` — retryable, and the delivery runner's business — rather
      than `rejected`, which is abandoned at once and would throw away a decision over contention
- [ ] Appending to a note that is not there is the target being wrong, which is `rejected`
- [ ] Tests: a lost-update race is not lost; a bounded number of retries is bounded; a missing note
      is rejected rather than created
- [ ] Verify: `pnpm -r --silent test`
- [ ] `git commit`

### Phase 6 — assets beside the note

Depends on phase 4.

- [ ] Each asset is `PUT` into the note's own collection under the name it was uploaded with, using
      the shared naming so a webdav vault and a filesystem vault name the same picture the same
      way, and the rendering links to it relatively. A reference back into notemap's blob layout
      breaks the moment notemap moves, which is why the filesystem kind copies too
- [ ] Streamed, not buffered: `DeliveredAsset.open` is lazy for the reason that a delivery may be
      carrying an hour of audio
- [ ] Tests: an image capture lands as a note and a file beside it, and the link resolves
- [ ] Verify: `pnpm -r --silent test`
- [ ] `git commit`

### Phase 7 — wired, and tried against the real thing

Depends on every phase above.

- [ ] `apps/daemon/src/ports.ts` registers the kind beside the filesystem one, with the credential
      resolver from phase 2. `GET /v1/destination-kinds` then publishes it and the composer builds
      the form with no shell change
- [ ] `packaging/docker` gains whatever the credential reference needs — an environment variable
      passed through, or a secret file mounted
- [ ] Verify by hand against the real Nextcloud: create the destination in settings, route a capture
      with `create-file`, and see the note in Nextcloud's web UI **without running a scan**. Then
      `append-to-file` onto it. Then open the vault in Obsidian and confirm the tags read as tags
- [ ] Anything the fake DAV server got wrong is a finding recorded here before this plan closes
- [ ] `git commit`

---

## Unknowns

- **Whether Nextcloud honours `If-None-Match: *` on `PUT`.** The whole no-overwrite guarantee rests
  on it. Fallback is `PROPFIND` then `PUT`, which is racy, and the race would have to be documented
  rather than hidden. Verify against the instance early — phase 4 is built on the answer.
- **Whether its `ETag` is stable enough for `If-Match`.** Same shape of risk for append. Fallback:
  append becomes a refusal on this kind until there is a safe way to do it, which is worse
  ergonomics and no lost data.
- **Large assets over plain `PUT`.** Nextcloud has its own chunked-upload protocol, and a proxy in
  front will have a body limit long before 256 MiB. Fallback: document the ceiling and refuse above
  it, rather than discovering it as a failed delivery.
- **What the base URL should actually be.** Whether a person pastes the full DAV collection URL or
  a host and a vault path that the adapter assembles. The first is honest and ugly; the second is
  friendlier and encodes an assumption about Nextcloud's URL layout into a kind named for a
  protocol.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

The kind is tested against an in-process DAV server, so the suite stays offline and fast, and phase
7 is the hand verification that says whether that server was honest. Phase 1 is tested by the
existing suite passing unchanged. `pnpm test:stack` is not required: nothing here crosses the HTTP
surface, the host's wiring aside, and phase 7 exercises that for real.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
