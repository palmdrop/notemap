#!/usr/bin/env bash
# Container setup for notemap, run by the sandbox entrypoint.
#
# Ordering it relies on: the firewall is already up (so a fetch from an
# unlisted host fails here, loudly, rather than halfway through the first
# task), and mise has already installed the node .nvmrc asks for — so `pnpm`
# below runs under node 24, not the image's.
#
# The node version is NOT set here. It belongs in .nvmrc, where the host and
# CI read it too; duplicating it in a setup script is how the two drift.

set -euo pipefail

# --frozen-lockfile: the lockfile is committed, so an install that would have
# to change it means the lockfile is stale. Better to fail at container start
# than to silently resolve something other than what everyone else has. An
# agent adding a dependency later runs `pnpm add`, which updates it properly.
pnpm install --frozen-lockfile
