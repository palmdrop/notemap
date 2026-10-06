# Release images: the daemon and every relay, on a release tag only

**Date**: 2026-10-06
**Status**: In progress
**Spec**:
**Closed**:

---

## Goal

Pushing a `v*` tag publishes `ghcr.io/palmdrop/notemap`, `ghcr.io/palmdrop/notemap-relay-arena`
and `ghcr.io/palmdrop/notemap-relay-memos`, each as `vX.Y.Z`, `vX.Y` and `latest`. A push to
`main` publishes nothing, and every pull request builds all three without pushing.

---

## Decisions

Settled with the developer on 2026-10-06.

- **Images are built from a release tag only.** The developer runs `latest` and pulls by hand, and
  builds on the server when they want something unreleased, so no `sha-<short>` image has ever
  been pulled. Building one per push to `main` cost a build per merge and left an image in GHCR
  forever. There is no manual dispatch either: building on the server already covers that case.
- **The relays are versioned in lockstep with the daemon.** One git tag is the version of all
  three images. A relay reaches the daemon over `/v1` and is built from `packages/relay` in the
  same repo, so relay `v0.9.0` is the one tested against daemon `v0.9.0`. A separate version per
  relay would add a compatibility question for no benefit. The compose files pin all three with
  the one `NOTEMAP_VERSION`.
- **One image per program, named `notemap-relay-<upstream>`.** These are separate GHCR packages
  beside `notemap`, built from the Dockerfiles that already exist. No combined relays image: a
  person runs the relays they use.
- **The matrix legs are independent.** One image failing to build does not cancel the others
  partway through a push. A release is complete when all three legs are green, and a failed leg
  is re-run on its own. The check that the tag matches `package.json` runs once, before any leg
  starts.
- **Each image has its own build cache scope on a pull request.** Under one shared `type=gha`
  cache the three builds would overwrite each other and every build would start cold. A release
  builds without a cache: a tag reads only caches written by itself or by `main`, and neither
  builds an image any more, so anything a release wrote would never be read.

### Unknowns

- **Whether `GITHUB_TOKEN` may create a new GHCR package** under the user namespace on its first
  push. It normally may, and links the package to the repo through the
  `org.opencontainers.image.source` label that `metadata-action` already sets. If the first
  release fails on the relay legs with a permission error: create each package once by hand
  with a pushed image, give the repo write access under the package's settings, and re-run the
  failed legs.
- **A new package is private.** So is `notemap`, and the repo, so the login `running.md`
  already asks for covers the relay packages too. Nothing to flip.

---

## Tasks

### Phase 1: CI

- [x] Create branch `agent/release-images`
- [x] `release.yml`: triggered by `v*` tags alone. The version check becomes its own job that the
      image job needs. The image job is a matrix over `{Dockerfile, image name}` with
      `fail-fast: false`, no cache, and no `sha-` tag. The comments describing `main` and `sha-`
      go.
- [x] `verify.yml`: the `image` job runs the same matrix on pull requests, with the same cache
      scopes, and pushes nothing
- [ ] Verify: `actionlint` on both workflows where it is installed. The PR's checks show three
      image builds, all green.
- [x] Commit

### Phase 2: docs

Independent of phase 1 in content. It lands in the same PR because the docs describe what CI
does.

- [ ] `docs/running.md`: the tags table loses `sha-`. The "Every push to `main`" paragraph is
      replaced by "a release publishes all three images". The relay images are named, with the
      login that already covers them.
- [ ] `docker/compose/compose.yaml` and `compose.proxy.yaml`: the commented-out relay services
      use `ghcr.io/palmdrop/notemap-relay-<upstream>:${NOTEMAP_VERSION:-latest}`. "No image is
      published yet" goes. A local build stays as the alternative for an unreleased change.
- [ ] `Dockerfile.relay-arena` and `Dockerfile.relay-memos`: their headers stop saying the image
      is not published
- [ ] `apps/relay-arena/README.md` and the memos relay's README: "In Docker" pulls the published
      image and keeps building as the alternative
- [ ] Verify: `pnpm lint` (prettier covers the markdown and YAML).
      `docker compose -f docker/compose/compose.yaml config` still parses.
- [ ] Commit

### Phase 3: first release

Depends on phases 1 and 2 being merged. This is done by the developer, not an agent.

- [ ] Cut a release with `pnpm release`. All three legs of `Image` are green, and GHCR holds
      the three packages, each with the new `vX.Y.Z`, `vX.Y` and `latest`.
- [ ] Optional: delete the old `sha-*` versions of `notemap` from GHCR. Nothing refers to them.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

Nothing here is unit-testable. The tests are the PR's image matrix (phase 1) and the first release
(phase 3).

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
