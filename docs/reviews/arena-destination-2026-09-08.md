# Review: The are.na destination, and the two changes that cleared the ground

**Date**: 2026-09-08
**Status**: Resolved
**Scope**: PR #49, `arena-destination` vs `main` — `packages/adapters/destination-arena/`,
`packages/output-markdown/`, both file kinds, `apps/daemon/src/{config,destinations,ports}.ts`,
`apps/ui/src/components/{routing,settings}/`, `packages/adapters/store-sqlite/src/migrations.ts`
**Plan**: `docs/plans/arena-destination.md`
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/shell.md`,
`docs/specs/security.md`

---

## Overall

Three phases landed as designed, and the implementation matches the plan closely enough that
walking the diff against it turns up almost nothing. Typecheck, `pnpm -r test`, lint and
`pnpm test:stack` are all green, the `Shipped:` trail is present and dated in all four listed
specs, and the arena package's tests cover every case the plan singled out — the URL-sniffing
boundary, the multi-asset refusal, `truncated`, and `accepts` excluding a payload type with no
renderer. No bugs.

Two things are worth attention before this is called finished. `docs/standards.md` still states
that every item leaving notemap carries provenance frontmatter, which this PR makes false by
default and which `core.md` now cites while narrowing — the one place docs and code disagree
(**1**). And the plan's one unchecked box, draining pending deliveries, is not a formality: a
routing record written before the rename is abandoned rather than retried, silently (**2**).

---

## Bugs

None.

---

## Design

### 1. `standards.md` was not changed with the behaviour it describes

`docs/standards.md:97` — *"**Routed-artifact frontmatter vocabulary** — every item that leaves
notemap carries, in YAML frontmatter, Dublin Core terms (`title`, `creator`, `date`, `source`) plus
`source_id`, `captured_at`, `capture_source`, `derived_from`. That is what lets an item that has
*left* the hub still be traced back, re-enriched, or re-routed."*

After this PR none of that is true of the default path. `frontmatter` absent means `none`
(`frontmatter.ts:100`), so every destination that already exists, and every new one whose form
nobody touched, writes prose alone. The are.na kind writes no frontmatter at all. `standards.md` is
untouched in the diff.

`core.md:1394` narrows the same claim carefully and correctly — and does it by pointing at
`standards.md`:

```
Everything that leaves the pool carries identity and provenance, per
[standards.md](../standards.md) — **where the destination writes it** (narrowed 2026-09-08).
```

So the spec now cites, as its authority, a document that says the opposite. AGENTS.md: *"Changing
behaviour means changing the doc that describes it, in the same change."*

Fix: narrow the `standards.md` bullet the way `core.md` was narrowed — the vocabulary is what a
destination writes **when it writes provenance at all**, and what makes an item traceable
unconditionally is the routing record rather than the file.

### 2. A pending delivery written before the rename is abandoned, not retried

`destination-fs/src/destination.ts:283`, `destination-webdav/src/destination.ts:231` — `compose`
and `carryOut` end in `default: throw new Refused(...)` / `Rejected`, and `rejected` is abandoned on
the **first** attempt (`core.md:857`). A routing record already in the queue carrying
`create-file` therefore does not come back on the next pass; it is thrown away and the item returns
unprocessed with an abandoned record.

The plan knows this — it is the one unchecked box, `docs/plans/arena-destination.md:141`:

```
- [ ] Drain any pending deliveries before this lands: one naming an undeclared capability dies.
```

The plan is marked **Status: Done** and **Closed: 2026-09-08** with that box open. The templates
migration (`migrations.ts:793`) deliberately covers templates and deliberately does not cover
records — which is right for a *historical* record, but a queued delivery is not historical, it is
work still owed.

Fix: either drain before deploying and check the box, or extend the migration to rewrite the
capability on routing records that are still **pending** (leaving delivered and abandoned ones
alone), which keeps "a record says what happened" intact for everything that already happened.
Whichever, the box should not be left open under a Done plan.

### 3. The are.na block's metadata invents a second provenance vocabulary

`destination-arena/src/blocks.ts:99-112` writes `notemap_item`, `notemap_source`,
`notemap_captured_at`, `notemap_derived_from`, `notemap_tags`. The file kinds write `id`,
`capture_source`, `captured_at`, `derived_from`, `tags` (`output-markdown/src/frontmatter.ts:11`),
which is the vocabulary `standards.md` names.

are.na's key rule is alphanumeric-or-underscore up to 40 characters, so every one of the standard
names is legal — the prefix is a choice, not a constraint, and neither the README nor the plan says
why it was made. The value under `notemap_derived_from` is the same `urn:commons:item:` URI the
file kinds use, so the two are the same data under two names.

Consequence: an item routed to a vault and to a channel carries provenance a consumer has to know
two spellings for, and `standards.md`'s claim to be the cross-app glue gets weaker each time a kind
picks its own words.

Fix: drop the prefix, or keep it and say in `standards.md` that a kind whose metadata shares a
namespace with the service's own may prefix — with the prefix named there rather than in one
adapter.

### 4. `arenaBlocks()` claims a property it does not have

`apps/daemon/src/destinations/renderers.ts:56`:

```ts
/**
 * The same dialect question for a board rather than a vault, and it stays here
 * for the same reason: what a delivery *becomes* is the daemon's, not the
 * adapter's. `@notemap/destination-arena` supplies the one that exists.
 */
export function arenaBlocks(): ArenaRenderers {
  return arenaRenderers();
}
```

`destinationRenderers()` directly above it earns that comment — `renderNote` is defined in the
daemon. `arenaBlocks()` does not: the dialect is `destination-arena/src/blocks.ts`, and this
function forwards. AGENTS.md is explicit that a comment claiming a guarantee must be one the code
enforces.

Fix: either move `renderNote` for blocks into the daemon beside the markdown one — which is what
the plan's *"the host wires `arenaRenderers()` beside the markdown ones, so dialect stays the
daemon's"* actually asks for — or delete the wrapper, wire `arenaRenderers()` straight into
`ports.ts`, and drop the claim.

### 5. "Exactly one secret source" is enforced by a convention nothing checks

`apps/daemon/src/config/load.ts:390` recognises a secret source by suffix — any key ending in
`File` or `Env` — and `credentials.ts:80` picks the first such key by object iteration order. The
per-kind schemas name `secretFile`/`secretEnv` and `passwordFile`/`passwordEnv` but mark both
optional and neither exclusive, so the "exactly one, and it exists" half lives only in the config
reader.

This is ADR 40's stated division and the comments on both sides are honest about it. The gap is
that nothing ties the two together: a kind declaring its secret as `credentialsPath` would pass its
own schema, satisfy `additionalProperties: false`, and then die at load with *"must say where its
secret is read from, in exactly one key ending in File or Env"* — a message about a convention its
schema never mentioned. `sourceOf` picking by iteration order is also load-bearing on an invariant
proved two files away.

Fix, cheapest first: have `refuseUnusableAccounts` assert that each registered schema declares at
least one property `isSecretSource` recognises, so a kind that breaks the convention is caught
where the convention is written rather than where it is used.

---

## Minor

### 6. The arena config example declares the same account twice

`apps/daemon/config.example.toml:179-186` shows two `[[accounts]]` blocks, both
`kind = "arena"` / `name = "mine"`, back to back with nothing between them. Uncommenting both —
which is what an example showing two blocks invites — is refused at startup by the duplicate
`kind`+`name` check. The webdav pair twenty lines above has exactly the sentence this needs:
*"The same account, taking its secret from the environment instead. Exactly one of the two, so this
is an alternative to the line above and not a companion."*

### 7. The README's outcome table is a delivery's answer, given as both

`packages/adapters/destination-arena/README.md` — *"The account is not declared, or its secret
cannot be read | `unreachable`"*. That is `deliver`'s answer (`destination.ts:88`); `probe` maps the
same failure to `Rejected` (`destination.ts:132`), which `destination.test.ts:334` asserts. The
`401` row in the same table splits probe and delivery explicitly, so a reader will take the
unqualified rows as covering both.

### 8. Nothing tests that a redirect is refused

`api.ts:114` sets `redirect: "manual"` and `api.ts:122` throws on `3xx`, and the README and
`docs/specs/security.md` both state it as a property. `ArenaServer.answerOnce(path, status, body)`
already takes an arbitrary status, so a test costs two lines. A claimed security property with no
test is the one kind of claim worth spending a test on.

### 9. `isSecretSource` rejects a four-character key ending in `Env`

`apps/daemon/src/config/load.ts:391` — `key.length > FILE.length && key.length > ENV.length`
applies both minimums to both suffixes, so `aEnv` is refused while `aFile` is accepted. The guard's
real job — refusing the bare words `File` and `Env` — works. Should be per-suffix.

### 10. Two unreachable branches in `provenanceOf`

`destination-arena/src/blocks.ts:116` breaks at `KEY_LIMIT` (50) over a list that holds at most six
entries, and `KEY.test(key)` is run against five string literals that are all known to pass. The
value-length check is real; these two are not.

### 11. An image preview leads with a blank line

`destination.ts:120` previews with `wanted.block.value`, which is `""` for an asset
(`blocks.ts:38`), so `outputOf` renders `"\n\n<caption>\n"`. The comment says the value is what a
preview cannot know, which is right; the empty first line is just how it comes out. Dropping an
empty value from `lines` would read better.

### 12. An optional enum setting cannot be returned to unset

`DestinationForm.svelte:98` — `offered()` prepends the `—` option only when the held value is
already `""`. Once `frontmatter` is set to `full`, the form offers `full` and `none` and no way back
to absent. Harmless for this field, since absent and `none` mean the same thing; it is the general
shape for any optional enum a kind declares later where they do not.

### 13. The uploads bucket is hardcoded where the response carries it

`api.ts:9` — `ARENA_UPLOADS = "https://s3.amazonaws.com/arena_images-temp"`, and `uploadedUrl`
composes the public address from it plus `key`. This is what
`docs/research/are-na-v3-api.md:1080` documents, so it is not wrong. But the presign response's
`upload_url` already names the real bucket, and stripping its query would be self-consistent with
whatever are.na actually signed. Noting it because `ArenaServer` makes the composition true by
construction — the fake's `uploadsUrl` and its `upload_url` are built from the same value — so no
test in the suite can notice if the real one moves.

---

## Non-issues

- **Frontmatter defaults to `none`, so every destination that already exists stops writing it.** A
  behaviour change with no migration, and deliberate: `core.md:1394`, `docs/running.md:283` and
  both file kinds' READMEs all state it, and AGENTS.md puts migrations out of scope for a
  greenfield project. Flagged only so it is not re-flagged.
- **Routing records keep `create-file` while templates were migrated.** The asymmetry is the plan's
  and `http-v1.md`'s: a record says what happened, a template is live. See finding 2 for the part
  that is not covered by that reasoning.
- **`duplex: "half"` cast through `as RequestInit`.** Required for a streamed body and absent from
  the DOM lib types. Nothing better available.
- **`arenaCandidates` lets `TokenRefused` propagate rather than wrapping it.** Same as
  `webdavCandidates`; only `NotOffered` is a value core reads.
- **`ARENA_ACCOUNT` allows an account with neither `secretFile` nor `secretEnv`.** Caught by
  `readAccounts` on the daemon's own path. See finding 5 for why the split is still worth a guard.
- **A numeric channel ID is passed through as a string in `channel_ids`.** `ChannelIds` is
  documented as taking IDs or slugs, and no fake can prove the real one agrees — which is what the
  plan's hand-verification note is for.
- **An asset already uploaded when `POST /v3/blocks` is rejected is orphaned in the bucket.**
  Unavoidable without a conditional create; ADR 41's territory.

---

## Verification

`pnpm -r --silent test` — exit 0.
`pnpm -s typecheck` — 0 errors across every package, including `svelte-check` over 880 files.
`pnpm -s lint` — eslint and prettier clean.
`pnpm -s test:stack` — 15 files, 65 tests, all passing.

---

## Resolution

Addressed 2026-09-08, in the same pass as the composer work the developer asked for.

1. **Fixed.** `docs/standards.md`'s routed-artifact bullet is narrowed the way `core.md` was:
   the vocabulary is what a destination writes *when it writes provenance at all*, one set of
   words wherever it lands, and what stays traceable regardless is the pool. `core.md`'s
   back-reference now says "and in that document's own words wherever it does", so the two agree.

2. **Fixed.** A second migration respells `capability` on routing records `WHERE state = 'pending'`.
   Delivered records keep the spelling they were written with. The plan's open box is closed, and
   its "do not migrate routing records" bullet is narrowed to delivered ones. Covered by
   `migrations.test.ts` — one owed record respelled, one delivered left alone — and the older
   destinations-moved test, whose pending record now reads `create`, says the same from the side.

3. **Fixed.** `provenanceOf` no longer spells a vocabulary of its own: it flattens
   `fixedFrontmatter(delivery)`, so a block's metadata carries `id`, `capture_source`,
   `captured_at`, `derived_from`, `payload_type`, `wasAttributedTo` and `tags` — the words a note's
   frontmatter uses. A test asserts the two key sets are equal, so they cannot drift.

4. **Fixed.** `arenaBlocks()` is gone; `ports.ts` wires `arenaRenderers()` directly and the comment
   that claimed the dialect was the daemon's went with it.

5. **Fixed.** `refuseUnusableAccounts` now also checks every *registered schema* declares a property
   `isSecretSource` recognises, so a kind spelling its secret `credentialsPath` is refused at
   startup with a message about the convention rather than dying later against it. `isSecretSource`
   is exported from `config/load.ts` for it.

6. **Fixed.** The arena config example gains the "an alternative to the block above and not a
   companion" sentence its webdav neighbour already had, and says uncommenting both is refused.

7. **Fixed, as a doc.** The finding was that the table said `unreachable` where `probe` throws
   `Rejected`. I first changed the code, then found `destination-webdav`'s own test titled *"rejects
   an account nothing declares, rather than calling it unreachable"* — the classification is a
   considered decision, not a slip, and the reasoning is the 401 row's: a person asking *now* is
   owed the answer that a config file will not fix itself. So both kinds keep `Rejected`, and the
   arena table's row is corrected to `unreachable` to a delivery, `rejected` to a check.

   Left open deliberately: core defines `Rejected` as *"what an adapter throws where it was reached
   and answered no"*, and an undeclared account was not reached. `unusable` — *"could not be asked
   at all"* — fits it better than either, and `probe.ts` already catches an adapter throwing it.
   Worth a decision; not one to make inside a review's cleanup.

8. **Fixed.** `destination.test.ts` answers `/v3/blocks` with a `302` and asserts `unreachable`,
   the detail naming the token, and that no block was created.

9. **Fixed.** `isSecretSource` applies each suffix's own minimum.

10. **Fixed.** `provenanceOf` iterates a map rather than a hand-built list, so the key-shape filter
    is doing real work and the `KEY_LIMIT` break guards a list that can genuinely grow.

11. **Fixed.** An empty value is left out of the block's readable form rather than drawn as a blank
    line, and the two parts join on `\n\n`. Tested on an image preview.

12. **Fixed.** `offered()` keeps the empty option for any field that is not `required`, whatever it
    currently holds, so an optional enum can be returned to unset.

13. **Won't fix.** `ARENA_UPLOADS` stays. `docs/research/are-na-v3-api.md:1080` documents
    `https://s3.amazonaws.com/arena_images-temp/<key>` as the address to compose, so the constant
    is the API's own statement rather than a guess. Deriving it from `upload_url` instead would
    trade a documented contract for an inference, and no test either way can tell which is right —
    hand verification against a real account is what settles it.

### Raised by this pass, not by the original review

- **`bind:value` on a field drawn before its arguments arrive writes its empty value over them.**
  Auto-picking a single capability exposed it: the field mounted in the gap between `describe`
  answering and a template's arguments being applied, and the binding clobbered them. Fixed by
  handing `choose` the template's capability and arguments so they land in the same step as the
  description. Caught by an existing test rather than by inspection.

- **Not fixed, and worth its own look.** The `settles` effect sets `capability = CREATE_OR_APPEND`
  unconditionally whenever a path kind declares it, so a template resolving to `create` or `append`
  on a filesystem destination is silently rewritten — and then `requestFor` sees the capability
  differ from what the template resolved to and commits as a bare decision rather than as the
  template. Pre-existing, out of this change's scope, and it wants a decision about what taking a
  template into a line-drawing kind should mean.

- **`probe`, `describe` and `candidates` reached the network with no deadline.** All three now get
  `AbortSignal.timeout(20_000)` from their route handlers; only the delivery runner bounded its own
  attempts before. Shared with the WebDAV kind, so both are covered.
