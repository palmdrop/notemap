# 31. The adapter decides create-or-append at delivery, not the composer at routing

**Date**: 2026-09-02
**Status**: Accepted — extends [ADR 26](0026-a-destination-can-be-asked-what-an-argument-could-hold.md)
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

The routing composer is being rebuilt around one typed line
([plan](../plans/typed-routing-composer.md)): a person types `projects/notemap/notes/decisions.md`
and commits, and nothing asks them whether that is a note to make or a note to add to. The answer
is read off the vault's own listing and said in one word above the button.

That word has to be stored as *something*. The two capabilities that existed were `create-file`,
which refuses a name that is taken, and `append-to-file`, which adds to a note and writes one that
is not there yet. Both are decisions the caller states up front, and the composer would have to
pick one at the moment of routing.

The trouble is when routing happens relative to when delivery happens. A routing decision is
recorded against a destination that may be asleep, unmounted or unreachable — that property is what
[ADR 28](0028-a-remote-destination-names-a-credential-profile-not-a-url.md) and the filesystem
kind's offline-safe `describe()` both exist to protect, and it is what makes deferred delivery work
at all. So the composer routinely commits a decision it could not check, and even when it could,
the check was minutes or hours before the write.

So: who decides whether the note is created or appended to, and when?

---

## Decision drivers

- **A record made against an unreachable destination must still be routable.** If the composer has
  to know what is in the vault to store anything, an asleep Nextcloud stops being routable, which
  is the property deferred delivery rests on.
- **The gap between routing and delivery is unbounded.** A delivery is retried past an unmounted
  drive for as long as it stays unmounted. Whatever the vault looked like when the record was made
  is not a fact about the vault when the write happens.
- **A guess that is wrong fails loudly and pointlessly.** `create-file` against a name that has
  since been taken is `rejected`, which is abandoned on the first attempt — the routing decision is
  thrown away over a filename collision the person never asked about.
- **The person was not asked, so they cannot be held to the answer.** The whole point of the typed
  line is that create-or-append is not a question anybody answers. Storing one of the two as though
  they had chosen it makes the record say something they never said.
- **The adapter is the only thing in a position to know.** It is holding the vault, at the moment
  of the write, and it already makes exactly this call: `append-to-file` writes a note that is not
  there rather than refusing.

---

## Considered options

1. **The composer stores what it inferred.** It asks `candidates` for the deepest scope, looks the
   leaf up, and stores `create-file` or `append-to-file` accordingly.
2. **A flag on `create-file`.** Something like `ifPresent: "append"`, so one capability covers both
   and the argument set says which.
3. **A third capability, `create-or-append-file`.** It means *put this there*, and the adapter
   resolves it against the vault as it finds it.

---

## Decision outcome

Chosen: **option 3**, and both existing capabilities are kept.

`create-or-append-file` takes `{ path, heading? }`. A trailing `/` on `path` names a folder and the
filename is derived; anything else names the file. A missing folder is made, an absent file is
created, and a present one is appended to under `heading`. Both kinds implement it by composing
what they already do rather than reimplementing either.

**The word the composer draws is a forecast, not a decision.** It is read off the same `candidates`
answer that draws the tree, it is honest about the vault as it stands, and it is never stored. What
is stored is `create-or-append-file`, and the adapter asks the question again when the answer is
true.

**Why the other two are kept.** `create-file` is the only capability that guarantees a note is
never added to — it is what `⇧⏎` stores when somebody explicitly means *make a new one beside it*,
and its refusal on a taken name is the guarantee, not a bug.

`append-to-file` earns its place on a narrower ground, and it is worth being exact about which,
because the obvious one is not true: **it does not require the note to already be there.** Both
kinds write one that is not, deliberately — the motivating case is a daily note whose sections
appear as things are filed into them. What it does carry that `create-or-append-file` cannot is a
*named path*: `path` is required, so nothing is ever derived, and a rule written against it files
into exactly the note it names or fails. `create-or-append-file` reads a trailing slash and derives
a filename from the item, which is what the composer wants and what a rule does not.

So: two capabilities that decide up front and one that defers, rather than three different
promises about what is already there. **A capability that means *this must already exist* does not
exist**, and if a rule ever wants one it is a fourth name, not a reinterpretation of this one.

**Why not option 1.** It has the composer commit an answer it could not check, to a question nobody
asked, which then fails hours later in the one way that cannot be retried. Against an unreachable
destination it has nothing to infer from at all — so either the composer refuses to route, or it
guesses, and guessing wrong is `rejected`.

**Why not option 2.** A flag reads as a modifier on *create* and it is not one: the append path
re-reads, inserts under a heading and writes conditionally, and on WebDAV it retries against an
`ETag`. Hanging that off `create-file`'s argument set makes one capability whose behaviour, failure
modes and retry semantics fork on a boolean. Capability names are what a destination advertises and
what a rule will one day be written against; three honest names cost less than one name meaning two
things.

**The name.** `create-or-append-file` is long, and nothing shorter was unambiguous: `write-to-file`
and `put-file` both promise an overwrite that never happens, and `add-to-file` faintly implies the
file is already there.

**`create-file`'s `directory` stops being required** in the same change. The adapter has always
read an absent one as `""`, which is the vault's root and a value it already accepts; the schema
was describing a constraint the code did not have.

### Consequences

- **Good** — an unreachable destination is fully routable with nothing degraded. There is no
  inference to make, so there is nothing that needs the vault to be up.
- **Good** — the stored record says what the person meant (*put this here*) rather than a mechanism
  they were never shown.
- **Good** — the collision that used to be a `rejected` delivery is now the ordinary outcome. A
  name taken between routing and delivery appends instead of failing.
- **Bad** — the drawn word and the delivered act can disagree. The composer says `append`, somebody
  deletes the note, the delivery creates. It is correct and it may still read as a lie; the routing
  record view says what actually happened, which is its job anyway.
- **Bad** — three capabilities where a reader might expect one, and every kind that writes files
  owes all three. Accepted: they are three different promises, and the shared
  `@notemap/output-markdown` package is where the cost is paid once.
- **Neutral** — an absent `directory` and an absent `path` are now both readable as the root, so
  `asCreateFileArguments` no longer rejects an argument set that merely omits it. Extra or
  wrong-typed keys are still refused, by the schema at core's boundary and by the reader
  respectively.

---

## Prior decisions this rests on

- [ADR 26](0026-a-destination-can-be-asked-what-an-argument-could-hold.md) — `candidates` is what
  lets the composer draw the forecast at all, and its `not-offered` answer is what a kind that
  cannot enumerate its contents says.
- [ADR 20](0020-destinations-are-pool-state.md) — a destination is a row, so the capability set is
  answered per destination by its kind's adapter rather than held anywhere central.
- [ADR 8](0008-adapters-are-in-process-and-wired-by-the-host.md) — one adapter per kind, handed the
  destination with the delivery, which is why "the adapter decides at delivery" needs no new wiring.
