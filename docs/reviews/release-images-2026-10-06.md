# Review: Release images

**Date**: 2026-10-06
**Status**: Partially addressed
**Scope**: `git diff main` on `agent/release-images` — `.github/workflows/`, `Dockerfile.relay-*`, `apps/relay-*/README.md`, `docker/compose/`, `docs/running.md`
**Plan**: `docs/plans/release-images.md`

---

## Overall

The CI matches the plan: tag-only trigger, the version check as its own job, a `fail-fast: false`
matrix over the three images, no `sha-` tag, and per-image cache scopes on pull requests. No stale
`sha-`, login or "not published" references remain. Both compose files still parse. Phase 1's
verify step is still open: `actionlint` isn't installed here, and the PR's matrix hasn't run yet.
The main finding is in the docs. The shared `NOTEMAP_VERSION` breaks the documented way to run a
local daemon build once a relay is uncommented, because the relays' own local-build advice uses a
different naming scheme.

---

## Bugs

### 1. `NOTEMAP_VERSION=dev` breaks any uncommented relay

`docs/running.md:497`, `docker/compose/compose.yaml:89,122`, `compose.proxy.yaml:89,125` — the
documented way to try a local daemon build is to tag it `ghcr.io/palmdrop/notemap:dev` and run
with `NOTEMAP_VERSION=dev`. The relays now share that variable, but their local-build advice tags
them `notemap-relay-<upstream>:local` and says to edit `image`.

```
NOTEMAP_VERSION=dev → relay image resolves to ghcr.io/palmdrop/notemap-relay-memos:dev
→ no such tag locally or in GHCR → compose up fails to pull
```

Fix: tag local relay builds the same way (`ghcr.io/palmdrop/notemap-relay-<upstream>:dev`) in the
Dockerfile headers, READMEs and compose comments. One `NOTEMAP_VERSION=dev` then covers all three,
which is the lockstep decision applied to unreleased builds too, and nobody has to edit `image`.

---

## Design

### 2. `running.md` says the images are public before they are

`docs/running.md:28` — "The images are public and need no login." According to the plan,
`notemap` is still private, and the relay packages will be private when first pushed. Between
merge and phase 3, a fresh host following the doc gets `denied` on pull. Make `notemap` public
before this merges, which is already possible. The relays stay a post-release step, as the plan
records.

### 3. Every pull request's image builds now start cold

`.github/workflows/verify.yml:107-108` — a PR reads caches from its own ref and from `main`.
`main` used to write the image cache through `release.yml`, and now nothing writes it there. Each
scope therefore only helps re-runs within the same PR, and the first run of every PR builds all
three images from scratch. The plan's rationale ("every build would start cold") is only half
addressed. This may be an acceptable trade. If so, the plan should say so.

---

## Minor

### 4. Arena's local build line reads as a required step

`docker/compose/compose.yaml:119`, `compose.proxy.yaml:122` — the memos block explains the build
as the alternative for an unreleased change. In the arena block, the `docker build` line now sits
bare after the token mint, with no explanation. It reads as a step to follow, and it builds a tag
the `image:` line below never uses.

### 5. The `version` job has default token permissions

`.github/workflows/release.yml:12` — the old single job declared `contents: read`. The split-out
`version` job declares nothing, and the workflow has no top-level `permissions`, so it inherits
the repo default. A top-level `permissions: contents: read` restores least privilege, and the
`image` job's block overrides it.

### 6. Files come from `main` while `.env` pins a release

`docs/running.md:21` — the tarball is `refs/heads/main`, so the compose files can be ahead of the
pinned image, for example a relay config key that only exists in an unreleased build. The clone
it replaces did the same, so this isn't a regression. But the step was rewritten, and
`archive/refs/tags/vX.Y.Z.tar.gz` would match what `.env` names. The top directory is then
`notemap-X.Y.Z`.

### 7. Relay images carry the daemon's OCI title

`.github/workflows/release.yml:66` — `metadata-action` derives `org.opencontainers.image.title`
and `description` from the repo, so both relay images are labelled `notemap`. Cosmetic. Setting
`labels: org.opencontainers.image.title=${{ matrix.name }}` would fix it.

---

## Non-issues

- **Unconditional `type=raw,value=latest`**: the workflow only triggers on `v*` tags, so
  `latest` still moves only on a release.
- **No build cache in `release.yml`**: correct as commented. A tag reads only caches from its own
  ref or `main`, and neither writes one.
- **`cancel-in-progress: true` on a tag ref**: the only collision is re-pushing the same tag,
  where cancelling the stale run is right.
- **Relay READMEs show no `docker pull`**: the compose service pulls the image, so a separate
  pull command would add nothing.
- **No `Shipped:` trail**: the plan lists no spec and is In progress.

---

## Resolution

1. **Fixed.** Local relay builds are tagged `ghcr.io/palmdrop/notemap-relay-<upstream>:dev` in
   the Dockerfile headers, READMEs and compose comments; `running.md`'s local section builds the
   daemon and each running relay as `dev`. Recorded as a decision in the plan.
2. **Open.** A manual GHCR step: make `notemap` public before this merges.
3. **Won't fix.** Accepted and recorded in the plan: a warm first run means a build per merge to
   `main`, which this plan removes.
4. **Fixed.** The arena block says its build is the unreleased alternative, as memos does.
5. **Fixed.** Top-level `permissions: contents: read` in `release.yml`.
6. **Fixed.** "Get the files" fetches the archive of the release tag being run.
7. **Fixed.** `metadata-action` sets `org.opencontainers.image.title` to the image's name.
