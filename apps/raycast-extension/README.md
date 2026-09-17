# Notemap for Raycast

Capture a note into your Notemap pool from anywhere. A note made while the daemon cannot be
reached waits in an outbox on disk and is sent by the **Drain Outbox** command, which runs in the
background every ten minutes and can be run by hand.

## Commands

- **Capture** — a note, tags already in use or new ones, and one attachment. The notice says
  whether it reached the pool or is waiting to be sent.
- **Drain Outbox** — sends what is waiting. Run by hand, it says how much is left.

## Preferences

- **Daemon URL** — where the Notemap daemon answers.
- **Access token** — a token the daemon issued, for a daemon that asks for one.

## Developing

Part of the Notemap workspace: `pnpm install` at the root, then `pnpm dev` here opens the
extension in Raycast. `pnpm typecheck`, `pnpm lint` and `pnpm test` as in every package.
