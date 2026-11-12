# Review: Search highlight (PR #128)

**Date**: 2026-11-12
**Status**: Open
**Scope**: `git diff main...agent/search-highlight`: `apps/ui/src/lib/found.ts`, `apps/ui/src/lib/highlighting.ts`, `Prose.svelte`, `Payload.svelte`, `Row.svelte`, `Feed.svelte`, `Queue.svelte`, `base.css`, `docs/specs/shell.md`, `apps/ui/package.json`, `pnpm-lock.yaml`
**Spec**: `docs/specs/shell.md`

---

## Overall

It works, and the approach is sound: the Custom Highlight API leaves the DOM and the renderer alone, offsets are mapped correctly through folds that change length, and each attachment deletes exactly the ranges it added. The biggest problem is performance. Every emission of `$feed` / `$queue` tears down and rebuilds the highlights of every visible row, even when the search has not changed. Two smaller divergences from the pool's fold make one of the code's own claims untrue. `found` is a second copy of ADR 70's match outside `@notemap/text`, and moving it there also settles the lockfile question. CI (`verify`, `stack`) is green on the PR head.

---

## Bugs

### 1. Every list emission re-walks every row's highlights

`apps/ui/src/components/primitives/text/Prose.svelte:25`, `apps/ui/src/components/feed/Feed.svelte:360`, `apps/ui/src/components/queue/Queue.svelte:434`. Svelte compiles `{@attach highlighting(terms)}` to `$.attach(div, () => highlighting(terms()))`. Its `managed` block compares the returned function by identity, and `highlighting` returns a new closure on every call. `terms()` is a plain prop getter all the way up through Payload and Row to `$feed().filter.words`. A store source is a `mutable_source` with safe-equals, so it always counts as changed:

```
any $feed emission (an item replaced, loading toggled by a page walk, sync)
→ every row's attach block re-runs → new closure ≠ old
→ teardown deletes the row's ranges → TreeWalker + found() over every text node → ranges re-added
```

Verified with a throwaway fixture: a store emitting five times with the same `filter` object gave 1 → 6 `add` and 0 → 5 `delete` calls on the highlight. On a feed of a few hundred rows that is a full re-fold of every visible note, plus a repaint of the whole highlight, each time the list changes at all. With no search on, the cost is only the closure, because `highlighting` returns early.

Fix: memoise by reference before the attachment, e.g. `const searched = $derived(terms);` in Prose and `{@attach highlighting(searched)}`. `filter.words` is held on the page and survives emissions (`client.ts:149`, `reads.ts:222`), so a strict-equals `$derived` stops the churn. Add a test that pushes an equal store value and asserts no re-registration.

### 2. A term can run across a space that carries a combining mark

`apps/ui/src/lib/found.ts:20`. `/^\s+$/u` only catches graphemes that are entirely whitespace. `" ́"` (a space followed by a combining accent) is a single grapheme. It fails the test, goes to `fold`, loses the accent, is trimmed to `""`, and the space disappears from `folded`. `found("bike ́rack", ["kerack"])` marks `ke ́rack`. The pool folds the same text to `bike rack` and does not match. This contradicts the comment on line 19 and the test name "a term never runs on across a space". It is rare, but it is the exact guarantee the code claims.

Fix: test the grapheme's first code point, `/^\s/u.test(segment) ? " " : fold(segment)`, and add the case to the space test.

---

## Design

### 3. `found` is a second implementation of ADR 70's match, outside `@notemap/text`

`apps/ui/src/lib/found.ts:1-54`. ADR 70's driver is "two implementations of one rule drift", so it puts the fold and the match in one package. `found` re-derives the match (fold, then substring) with different mechanics: fold per grapheme, and a whitespace special case that works around `fold`'s trim. It has already drifted twice (#2, #4), and the `@notemap/text` tests and its Stryker run never see it. Move `found` (as `where` / `spans`, whatever name fits `CONTEXT.md`) into `packages/plumbing/text/src/`, beside `fold` and `holds`. Factor `fold` into a per-character core plus the whitespace step, so the two share the per-character rule and `found` doesn't need the regex workaround. The UI would then import it from `@notemap/text`.

That also answers the lockfile question. **A direct `@notemap/text` dependency is the right seam.** The UI already depends on `@notemap/output-markdown` directly, and the 3-line lockfile addition is a workspace link, not a regeneration. Re-exporting `fold` from `@notemap/client` would turn the client into a pass-through for a package it doesn't own and hide the real dependency. It also would not serve the plain-text matching this needs, which isn't a client concern.

### 4. Greek final sigma is never marked, and it can be fixed here

`apps/ui/src/lib/found.ts:20`. The PR body lists this as a known limit. `fold("ΟΔΟΣ")` is `οδος`, but folding grapheme by grapheme gives `οδοσ`. A person who types `οδος` gets the row and sees no mark. `ς`→`σ` is one UTF-16 unit for one unit, so `found` can map it on both `folded` and each term without disturbing the offset arrays. The limit goes away and nothing needs documenting.

Out of scope but surprising, and worth a todo: the pool has the reverse bug. `fold` is context-sensitive for `Σ`, so the stored column holds `οδος`, and a typed `οδοσ` (medial σ, as many keyboards produce) finds nothing. Fixing `fold` itself means a backfill migration of the folded column.

### 5. The spec leaves out a limit a reader will see

`docs/specs/shell.md:1259-1265`. The paragraph is observable and accurate except for one thing. A row is clamped to ten lines (`Clamp.svelte`), so a match below the clamp keeps the row on the list and shows no mark until `+ N lines` is opened. Add it to the "marks nothing" sentence. If #4 is not taken, the sigma limit belongs there too. Without it, the Shipped line's "folded as the search folds it" (`shell.md:7`) overstates what was built.

---

## Minor

### 6. Per-grapheme fold is ~8× the whole-text fold

`apps/ui/src/lib/found.ts:19-26`. Measured in Node on a 9.9k-character note: `found` 3.1 ms, `fold` of the whole text 0.37 ms. This is acceptable once #1 is fixed, since it then runs once per row per search change. If it shows up anyway, an ASCII fast path in the loop (one-unit grapheme below 0x80 → `toLowerCase`) removes most of it.

### 7. `base.css` comment explains a rejected alternative

`apps/ui/src/styles/base.css:39-40`. "inverted, since a link in them is already underlined" gives the reason for not underlining. AGENTS.md rules that out of comments. Drop the clause, or drop the comment: `::highlight(search)` names itself.

### 8. `SEARCH` is exported and nothing imports it

`apps/ui/src/lib/highlighting.ts:6`. The tests and the CSS use the literal `"search"`. Unexport it, or use it in the tests.

### 9. The registry stub is written twice, and the feed has no test

`apps/ui/src/components/queue/Queue.test.ts:2271-2287` repeats `registering()` from `text.test.ts:65` inline, with its own try/finally. Move `registering` into `$testing/` and use it in both. Feed's one-line wiring (`Feed.svelte:360`) has no test. The Queue test covers the same path, so this is optional.

---

## Non-issues

- **Lifecycle on unmount, clear, terms change, view switch, page walk.** Each attachment closes over its own `ranges` and deletes exactly those from the `Highlight` it captured, so unmounting a row leaves nothing stale. Clearing the search re-runs with `[]` and adds nothing. New rows from `load more` register on mount. Switching views unmounts. The empty `search` highlight left in the registry is harmless.
- **`{#key html}` remount.** `html` is a string `$derived`, so the key only fires when the rendered output changes, and before this PR `{@html}` replaced the inner nodes in that case anyway. No focus regression: the only focusable content is links that were already being replaced, and while a row is edited `Payload` is swapped for `Edit`, so Prose isn't mounted. Unfurls is a sibling keyed on `text`, outside Prose. Clamp observes its own box. There are no transitions inside the key.
- **Offset mapping.** Probed beyond the tests: ZWJ families, flags, Hangul, astral letters, `İ`, `ß`/`ss` (correctly not equated, as the pool doesn't), the `ﬁ` ligature (not equated, as the pool doesn't), a leading lone combining mark, and stacked marks. All agree with `fold` + `includes`. Overlapping and adjacent spans join, and that is intended.
- **Matches the row's text where the pool matched elsewhere.** The pool matches the markdown source plus attachment names, and the highlight marks the drawn text. They can disagree on which text is marked, but never on which rows are listed. The spec says so.
- **"timeline" in the spec.** It is the view's name (`timeline ▾`), not the feed synonym CONTEXT.md avoids.
- **No plan, so no Shipped trail to check beyond the spec's own entry**, which is present.
