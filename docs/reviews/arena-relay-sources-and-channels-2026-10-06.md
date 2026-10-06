# Review: are.na relay titles, source URLs and channels

**Date**: 2026-10-06
**Status**: Open
**Scope**: `apps/relay-arena/` (`git diff main...HEAD`, PR #92)
**Plan**: `docs/plans/arena-relay-sources-and-channels.md`

---

## Overall

Matches the plan. Typecheck, `pnpm -r --silent test`, lint and `pnpm test:stack` are all green. No data-loss bug: ids of existing items do not move, versions are deterministic, and the one-time burst is documented as agreed. The live v3 shape matches the mapping: a Channel entry carries `slug`, `title`, and `description` as `null` or a `{markdown}` object. Image and Text blocks do carry `source.url`. Real findings are the substring dedup (#1), a foot-only text now written twice (#2), a stale full-stack test that passes by accident (#3), and a few coverage gaps.

---

## Bugs

### 1. Substring dedup drops a source URL that is only a prefix of a longer one

`relayed.ts:~145` — `words?.includes(link)` is a raw substring test.

```
source.url = https://example.com/essay
words      = "see https://example.com/essay/part-2"
→ includes() true → source URL omitted, the page it was saved from is lost
```

The same happens with `http://x.com/a` inside `http://x.com/a?b=1`. The inverse also misses: `https://x.com/a/` in the source against `https://x.com/a` in the words, or differing case in the host, repeats the URL. The first is silent loss of provenance, the second is only noise. Dedup also now applies to Link and Embed, which previously always appended the URL, and the plan table calls them "unchanged".

Fix: match the URL as a whole token (next char not a URL character, ignoring a trailing `/`), or accept the loose rule and name it in the README and plan.

---

## Design

### 2. A foot-only text keeps its foot and the tags, and now sits mid-prose

`relayed.ts:~136` with `packages/relay/src/tags.ts` `classified` — a block whose whole words are `#kind/quote` keeps that text so the capture is not empty. That guard no longer applies once a title or link is composed around it. The result is `"Title\n\n#kind/quote\n\nhttps://…"`, with `kind/quote` also in `tags`. The tag is written twice, which is what `hashtags` exists to prevent, and the foot is mid-prose, where the plan says it would be read as prose. `classified` does not know a title or link will follow.

Fix: decide emptiness after composing, not inside `classified`. Alternatively, record the edge in the README as accepted.

### 3. Full-stack Channel test passes by accident and is stale

`tests/full-stack/src/relay-arena.test.ts:229` — "relays nothing for a Channel-class block" expects `empty=1`. It passes only because the fixture has no `slug` and no `title`, so nothing is composed. It now contradicts the behaviour. `apps/relay-arena/src/run.ts:15` still says the `empty` tally covers "a channel-class block". The README log paragraph is unaffected.

Fix: rewrite the full-stack test to assert a Channel block is captured, with its identity `channel/<id>`. Fix the `run.ts` comment.

### 4. Plan decision worth a second look: a Channel's `channel/<id>` identity versus its text

The identity is right. But the version digests the text, which includes the slug. A slug rename revises the item. That is acceptable, since it is a real edit of the link, but it is not mentioned in the README.

---

## Minor

### 5. Nested ternary in `titleOf`

`relayed.ts:37-43` — a nested ternary inside a ternary reads poorly. Two early returns would be flatter. `uploadedAs` is reused only for Image and Attachment, which is correct.

### 6. Test gaps

`relayed.test.ts` has no test for:
- a Channel's description foot with `hashtags: true`, though the plan states it is read;
- a Channel with no `slug` (no link), or with a slug needing `encodeURIComponent`;
- a Channel with `description: null`, which is the real shape;
- an Embed with a source URL, or a Text block with a title only;
- the Image filename-only title suppressed while the source is still carried;
- the dedup edge cases from #1;
- version stability, meaning the same block twice gives the same version and adding a title changes it;
- a foot-only text with a source (#2).

### 7. README wording

`apps/relay-arena/README.md` — the row "an Image or Attachment block's title…" omits the "unless only a filename" rule that the plan table has. The long foot paragraph has one overlong line (line ~99). Neither is a code mismatch. The README burst note says it applies to "every unprocessed item made from a block carrying either". A hashtags-on Link whose caption had a foot also re-versions, because the foot is now read before the URL. That is a second, unmentioned source of the burst, though it is small.

---

## Non-issues

- **Image and Text `source.url` is widely present.** Many are.na images carry the page or file URL (for example a pinimg `.jpg`), so most images revise once on upgrade. This is the accepted burst, and not a bug.
- **Channel `connected_at` as `capturedAt`** — consistent with blocks.
- **`channel/<id>` containing a slash** — attachment ids already use slashes, and the full-stack suite passes.
- **Plan Spec field is empty**, so there is no `Shipped:` entry to check.
- **`description` as `{markdown}` for Channel** — confirmed against the live API; `null` is handled by `nonEmpty`.
- **Comment discipline and CONTEXT.md vocabulary** — the new comments are all "why" comments and cite no docs.

---

## Resolution

<!-- Not yet addressed. -->
