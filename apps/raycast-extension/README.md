# Notemap for Raycast

Capture a note into your Notemap pool from anywhere. A note made while the daemon cannot be
reached waits in an outbox on disk and is sent by the **Drain Outbox** command, which runs in the
background every ten minutes and can be run by hand.

## Commands

- **Capture** — a note, any number of attachments, and tags already in use or new ones. Attachments
  alone, with no words, are a capture too. The notice says whether it reached the pool or is waiting
  to be sent. Left with Escape, the form keeps the note and its tags for the next launch, though not
  its attachments, until a capture is made. A trigger tag whose template asks for
  something, a todo list's heading say, adds a field for it under the tags, listing what the
  destination holds where it can. A place is typed rather than listed. A field with no default
  starts on `choose`, and the capture asks for it until something is chosen.
- **Drain Outbox** — sends what is waiting. Run by hand, it says how much is left.

## Preferences

- **Daemon URL** — where the Notemap daemon answers.
- **Access token** — a token the daemon issued, for a daemon that asks for one.

## Developing

Part of the Notemap workspace: `pnpm install` at the root, then `pnpm dev` here opens the
extension in Raycast. `pnpm typecheck`, `pnpm lint` and `pnpm test` as in every package.
