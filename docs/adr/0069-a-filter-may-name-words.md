# 69. A filter may name words

**Date**: 2026-11-01
**Status**: Accepted — extends the **filter** of the queue and the feed
([core.md](../specs/core.md)); leaves [ADR 14](0014-pagination-by-domain-position.md)'s
order and position as they are
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A person looking for a capture they half remember has tags, states, destinations and sources to
narrow the queue and the feed by, and nothing that reads what the capture says. The mobile redesign
draws a search field on both, and `todo.md` asks for "fuzzy search for captures, feed, tags, other
views".

How does a surface find items by their words, and where is that answered?

---

## Decision drivers

- **A filter is already the shape.** A condition on a surface, answered by the pool, held in the
  address, gone when the surface is opened afresh. Words are one more condition of that kind.
- **Offline is a first-class reading.** A filtered surface is drawn from the client's cache when
  the pool is out of reach, by the same rule the pool applies.
- **Two implementations of one rule drift.** ADR 35 refused that for pattern expansion; the same
  holds here, since the client and the pool must agree on what matches.
- **Search may not assume storage beside the pool** (ADR 1's amendment). The store answers it
  behind its port, as it answers every other filter.
- **Every script is somebody's**, as ADR 67 says of names.

---

## Considered options

For how words match:

1. **Substring, folded.** Each whitespace-separated term must appear in the item's words, ignoring
   case and accents.
2. **Full-text tokens with prefix**, as SQLite FTS5 reads them: `bike` finds *bikes*, not
   *motorbike*.
3. **Fuzzy and ranked**, typo-tolerant, as uFuzzy or fuse.js answer.

For where:

1. **In the pool only.** Nothing offline.
2. **In the client's cache only**, which holds the working set and a capped slice of history, so it
   would be silently short on the feed.
3. **In the pool, and over the cache by the same rule when the pool is out of reach.**

For the pool's index:

1. **None**: fold every item's words at every read.
2. **A folded text column per item**, written by the store on capture and amendment, read with
   `instr`.
3. **SQLite FTS5**, `unicode61` or `trigram`.
4. **Embeddings**, `sqlite-vec`.

---

## Decision outcome

Chosen: **folded substring**, **in the pool and over the cache by one rule**, **a folded column**.

**What matches.** The item's words are every string its payload content holds, in order, and the
filenames of its attachments. Its words and the filter's are folded alike: decomposed, nonspacing
marks dropped, recomposed, lower-cased, runs of whitespace made one space. The filter's folded
words split on whitespace into terms, and an item matches where every term is a substring of its
folded words. `weep` finds *sweeper*, `cafe` finds *Café*, and `東京` finds a capture written
without spaces. No phrases, no operators, no ranking: the surface keeps its own order and position
(ADR 14), and the cursor carries the words like any other filter.

**One function.** The fold and the match live in `@notemap/text`, which has no dependencies, so
core and the client import the same code and the online and offline answers cannot differ.

**The pool's index** is a folded column the store writes with the item, on capture, amendment and
revision, and reads as one `instr` clause per term beside the other filter clauses. It is derived,
so the mirror does not carry it. FTS5 `trigram` over the same column returns the same rows faster,
and is added only where a measured page is slow: it is an optimisation, not a change of behaviour.

On the wire and in the domain the condition is `words`. The shell presents it as **search**, as it
presents `archive` as discard.

### Consequences

- **Good** — offline search is the same search.
- **Good** — every script matches, including those written without spaces, since nothing is
  tokenised.
- **Bad** — a term matches inside words: `art` finds *start*. Accepted as the price of a rule a
  person can predict and a client can repeat.
- **Bad** — dropping nonspacing marks folds together some words a reader of that script would keep
  apart. Both sides fold alike, so it only ever finds more.
- **Bad** — an `instr` scan reads every row the other clauses leave, and a rare term reads the
  whole table to fill a page.
- **Neutral** — a migration adds and backfills the column.

---

## Pros and cons of the options

### Full-text tokens

- **Good** — indexed from the start.
- **Bad** — the client would have to imitate FTS5's tokenizer to agree offline, and a word inside a
  word is not found, which is most of what a half-remembered search is.

### Fuzzy and ranked

- **Good** — forgives typos.
- **Bad** — a ranking, not a condition: a ranked read needs a cursor of its own under ADR 14, and a
  library on both sides. "Fuzzy" in `todo.md` meant forgiving, which folding gives.

### The cache only

- **Bad** — silently short of everything the cache does not hold.

### Embeddings

- **Bad** — a model, an index and a ranking, for a question a substring answers.

---

## More information

Plan: [features from the mobile rethink](../plans/features-from-the-mobile-rethink.md), S1–S4.

Revisit if a measured page with words is slow past FTS5 `trigram` too, if people ask for typo
tolerance by name, or if the log, settings or a destination's files want the same search.
