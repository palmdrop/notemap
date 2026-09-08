# @notemap/relay-memos

A memo written in [Memos](https://usememos.com) appears in the notemap queue —
with its pictures, at its own capture time, carrying the tags it already had —
and a memo edited afterwards amends or revises the item it became.

It is a **relay**: a program outside notemap, reaching `/v1` with an access
token like anything else that is not a browser
([ADR 39](../../docs/adr/0039-a-relay-is-outside-notemap-and-reaches-v1-like-anything-else.md)).
Nothing about it is in the daemon.

```sh
pnpm --filter @notemap/relay-memos build
node apps/relay-memos/dist/main.js --config ~/.config/notemap/relay-memos.toml
```

`--once` polls once and exits non-zero if anything went wrong, which is the
shape cron wants. `--help` says the rest.

## What it does with a memo

| Memos                    | notemap                                          |
| ------------------------ | ------------------------------------------------ |
| `memos/{uid}`            | `sourceItemId`                                   |
| `createTime`             | `capturedAt` — never the time the poll ran       |
| `updateTime`             | the identity an edit is captured under           |
| `content`                | `note` prose, verbatim, `#tags` and all          |
| `tags`                   | tags, attributed to the source, **at capture**   |
| `attachments`            | assets, in order, under derived ids              |

A memo with neither prose nor an attachment is not captured: core would take
it, and a relay guards its own input.

A memo deleted upstream is left alone. Notemap never loses an item, and there
is nothing to do.

**Tags travel once.** A capture whose payload is unchanged is `already-captured`
whatever its tags say — the pool drops tags from that comparison so that an item
classified in notemap since does not read as a conflicting resubmission of
itself. So a memo re-tagged upstream keeps the tags it arrived with, and so does
an item amended or revised from one. Classify in notemap or in Memos; the two do
not reconcile.

**An edit to a *processed* memo lands at the time of the poll.** A revision is
an ordinary capture carrying a link, and mints its own capture time of now
([core.md](../../docs/specs/core.md#editing)) — there is nowhere to put the
memo's. Only the first capture of a memo sits where it was written. Each
further edit makes another revision, independent of the last, so a memo edited
three times after it was delivered leaves three items in the queue.

## What it holds

Nothing. Every poll reads every memo and posts it; the pool answers
`already-captured` for the ones it has, and dedup on `(source, sourceItemId)`
is what makes re-reading everything harmless. There is no watermark, no cursor
and no database — so there is nothing to lose, corrupt or migrate, and a poll
that failed halfway is repaired by the next one.

An asset id is derived from the attachment's own upstream name rather than
minted, so an attachment is uploaded once and a memo carrying one does not look
edited on every run. `packages/relay` does that half.

## What it says

Failures go to its own log and nowhere else: notemap has nowhere to put another
program's errors, and a relay that could not reach the pool has nothing to
report to it by definition. A memo that could not be relayed is logged and the
scan carries on.

Whether it is running at all is read from the other end —
`GET /v1/sources`, drawn in notemap's settings, says when each source last
captured.
