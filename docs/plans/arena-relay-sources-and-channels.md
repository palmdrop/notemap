# are.na relay: titles, source URLs and channels

**Date**: 2026-10-06
**Status**: In progress
**Spec**:
**Closed**:

---

## Goal

The are.na relay captures a Text block's title, the source URL of any Text, Image or Attachment
block that has one, and a Channel block as a link to that channel, all in the item's prose. A
`#tag` foot is still read when the relay composes text after it.

---

## Decisions

Settled with the developer on 2026-10-06.

- **Prose only.** The relay sends `metadata: {}` and nothing reads a payload's metadata: not the
  shell, not a destination. Anything outside the prose would be invisible. A source URL is
  something a person would have written themselves, so it belongs in the prose. Provenance that
  is not (the block's are.na permalink, `connected_by`, `source.title`) waits until metadata is
  rendered somewhere.
- **No preview image for a Link.** The shell already unfurls a URL in the prose.
- **A Channel block is captured as a link.** This reverses "a channel connected into a channel is
  not a note". Its prose is its title, its description and `https://www.are.na/channel/<slug>`.
  That form resolves for a channel owned by a user or a group alike, and answers 404 for a slug
  that does not exist. A channel carries no attachment.
- **A channel's identity is `channel/<id>`.** Channel ids and block ids are separate sequences on
  are.na, so a bare id could name a block and a channel in one source.
- **The foot comes off the block's own words before anything is composed around them.** The
  block's own words are a Text block's content, or the caption of any other class, or a channel's
  description. Appending a URL after them would otherwise leave the foot mid-text, where it is
  prose. Link captions already had this problem. A title is never read for a foot.
- **The source URL is left out where the block's own words already hold it.**
- **The one-time revision burst is accepted.** The prose changes for every block gaining a title
  or a source URL, so the next full poll amends each affected unprocessed item and revises each
  processed one, once. No flag.

### Composed prose, by class

| are.na              | prose, each part present or not, joined as paragraphs              |
| ------------------- | ------------------------------------------------------------------ |
| Text                | title, content, source URL                                         |
| Link, Embed         | title, caption, source URL (unchanged)                             |
| Image, Attachment   | title unless it is only a filename, caption, source URL            |
| Channel             | title, description, `https://www.are.na/channel/<slug>`            |

### Left open

- **Whether an upstream edit to a processed item should resurface it.** Today it becomes a
  revision in the queue, which is the only way the edit reaches a destination. Recorded in
  `docs/todo.md` as a per-source relay policy in `packages/relay`, with archiving the revision as
  the likely option. Not built here.
- **Why links seemed mishandled.** The live v3 shape matches what the mapping reads, and neither
  of us could reproduce it. One guess: are.na fills a link's metadata asynchronously, so a fresh
  link is read bare and amended later. Not acted on.

---

## Tasks

### Phase 1: mapping

- [x] Create branch `agent/arena-relay-sources-and-channels`
- [x] `ArenaBlock` carries what a Channel-class entry answers: `slug`, and a description in the
      same prose shape
- [x] `relayedFrom` reads the foot off the block's own words, then composes title, words and URL
      per the table above
- [x] Channel blocks map to a link under `channel/<id>`
- [x] Tests in `relayed.test.ts`: Text title and source, Image and Attachment source, a source
      URL already in the words, a foot on a Link caption, a foot on a Text block followed by a
      source URL, a Channel block, a channel's identity
- [x] `run.test.ts`: a Channel block is captured rather than counted empty
- [x] Verify: `pnpm --filter @notemap/relay-arena typecheck`, `pnpm -r --silent test`, lint
- [x] Commit

### Phase 2: docs

Depends on phase 1.

- [ ] `apps/relay-arena/README.md`: the mapping table, the Channel row, the foot paragraph, and
      the one-time amend or revise on upgrade
- [ ] `docs/todo.md`: close the two are.na relay items. Add the processed-edit policy item.
- [ ] Commit

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed and linking back to this plan. No implementation details, no granular tasks. A plan marked Done whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
