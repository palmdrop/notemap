# Review: Feed selection jump, and placeholders on typed settings (PR #127)

**Date**: 2026-11-12
**Status**: Addressed
**Scope**: `git diff main...agent/feed-jump-and-field-hints` (cf7d2ded, 50cad036)
**Spec**: `docs/specs/core.md`, `docs/specs/shell.md`

---

## Overall

Both commits do what they say. Typecheck, lint and `pnpm -r --no-sort --silent test` are green
at 50cad036, and the new feed test fails with main's `Feed.svelte`, as the PR says. The jump
fix is correct for every path that changes the selection: walking with keys, a click, marking,
Escape, a filter move, a row leaving a filtered feed, and a row processed while selected. The
existing "waits where it stood" behaviour is kept. The fix ties `stood` to the selection but not
to the order the feed was read in, so the same symptom still appears when the order or the key is
turned while a row is selected (1). That bug predates this PR, but it is the same bug class and
fits in this change. On the placeholder side, the WebDAV folder's example
contradicts what a blank folder means (2), and both specs claim more than the code does (3, 4).

---

## Bugs

### 1. A selected row still jumps when the order or the key is turned (pre-existing, same cause)

`apps/ui/src/components/feed/Feed.svelte:140` and `:163`: `stood` now belongs to a *selection*,
but it was measured in a particular *reading* (order and `by`). Turning the order through
`Order.svelte` calls `client.loadFeed(wanted, by)` and keeps the selection, because
`filtering`'s `onmove` fires on a filter change only. So:

```
feed by processed, latest first, `three` selected at 0 (stood=0, stoodFor=three)
→ choose `earliest` → live is [one, two, three], at=2, was=0
→ derivation puts `three` back at 0; effect returns early (processed && stoodFor === selected)
→ drawn [three, one, two] until the selection leaves
```

Reproduced through the chooser in a scratch test (not committed). Switching the key from
`captured` to `processed` with a row selected does the same: `stood` was last written under
capture order, so the row keeps its capture-order index. That is roughly the symptom the todo item
described.

Fix: forget the place when the reading changes. Clear `stood`/`stoodFor` in an effect on
`$feed.order` and `$feed.by`, or key the pair on `selected` + order + `by`. Add a test that turns
the order with a row selected.

---

## Design

### 2. WebDAV's folder placeholder says `notes`, but a blank folder means the account's own

`packages/adapters/destination-webdav/src/settings.ts:45`: `root` is required, but may be empty,
and empty means "the destination is the account's folder itself" (its own `description`, which
the form does not draw). A greyed `notes` in that box suggests that leaving it blank files under
`notes/`. In fact it files at the account root. Are.na's placeholder (`credentials.ts:21`) is the
opposite kind: it is exactly what blank comes out as. So the one slot carries two meanings, an
example on some fields and the outcome on others, and the reader cannot tell which.
`shell.md` already says an unset setting is named "as what it comes out as" (`default (none)`).

Fix: settle on one rule and write it into `core.md:1664`: on a field where blank is a valid
value, the placeholder is what blank comes out as, or there is none. Under that rule, drop the
WebDAV `root` placeholder. The filesystem `root` and WebDAV address placeholders are fine, because
a blank there is refused.

### 3. `shell.md` says a blank field comes out as unset; a required one is sent as `""`

`docs/specs/shell.md:2889`: "never sent, so a blank field still comes out as unset."
`valuesFrom` (`apps/ui/src/lib/schema-form.ts:309`) skips a blank field only when it is optional.
Three of the four fields that carry a placeholder are required (filesystem `root`, WebDAV `root`,
WebDAV `baseUrl`), so a blank there is sent as `""`. The filesystem schema refuses that
(`minLength: 1`); WebDAV `root` accepts it. The new UI test
(`apps/ui/src/components/settings/Destinations.test.ts:367`) passes only because its stand-in
`filesystem` schema leaves `root` unrequired, which the real one does not.

Fix: reword to "the placeholder itself is never sent", and leave unset to the rules that already
govern it. Make the test schema `required: ["root"]` and assert the refusal, or keep it optional
and say in the name that it is the optional case.

### 4. `core.md` promises the placeholder on arguments fields, and no arguments form draws it

`docs/specs/core.md:7` ("a settings, account or arguments field") and `:1666` ("A form draws it in
the field while the field is empty") cover arguments. The composer
(`apps/ui/src/components/process/Process.svelte:1068`) and the template form
(`apps/ui/src/components/settings/TemplateForm.svelte:451`) already use the placeholder slot for
`required`/`optional`/asked, so an adapter that marks an argument gets it validated and then
silently ignored. Nobody marks one today.

My recommendation is to leave those two forms alone for now and narrow the spec. Their slot
already says something the person needs, and putting an example in it would mean choosing which
of the two wins, which deserves a decision of its own. Narrow `core.md` to settings and account
fields, or say in `shell.md` that the argument forms keep `required`/`optional` and do not draw it.
If you would rather wire it in, pick a precedence (for example `optional — e.g. notes`) and spec it.

### 5. Two variables for one fact in `Feed.svelte`

`apps/ui/src/components/feed/Feed.svelte:121-122`: `stood` is `$state` and `stoodFor` is a plain
`let`, and they are only meaningful together. The derivation and the effect each re-check
`stoodFor === selected`. This bug came from the two drifting apart. One
`let stood = $state<{ id: string; at: number } | undefined>()` makes the pairing structural, and
would also be the natural place to hang the reading key from 1.

---

## Minor

### 6. The validator's acceptance and refusal of `x-notemap-placeholder` are untested

`packages/adapters/schema-ajv/src/validator.test.ts:114`: every other annotation has a "tolerated"
and a "throws on the wrong shape" case. The PR body says the validator checks for a non-empty
string, but nothing exercises `""` or a non-string. Add the pair, following the `x-notemap-path`
case.

### 7. The account form's placeholder is untested

`apps/ui/src/components/settings/AccountForm.svelte:101` is drawn, but no case in
`Accounts.test.ts` checks it. One assertion on the attribute is enough.

### 8. `vocabulary.ts` still describes itself as arguments-only

`packages/core/src/pool/destinations/vocabulary.ts:5`: "The words notemap itself puts into an
adapter's arguments schema". `PLACEHOLDER_FIELD` lives on settings and account schemas. Widen it to
"an adapter's schemas".

### 9. The new feed test duplicates its neighbour's `order()` helper

`apps/ui/src/components/feed/Feed.test.ts:760` is a copy of `:730`. Hoist it beside `open`/`stamps`.

---

## Non-issues

- **The queue has no `stoodFor`.** `Queue.svelte` reads `stood` only for a selected row that is
  absent from the live list, and a row leaves the queue only while selected. So a new selection
  always lands on a live row and overwrites `stood` before anything reads it. The feed reads
  `stood` for a row that is still live (one moved by its own decision), which is why it needs the
  owner check. The PR body's "the queue already cleared it" is true only through `deselect`. The
  structure is what actually makes it safe.
- **`stoodFor` is not reactive.** It is read inside `untrack` in the derivation and written only by
  the effect, so being reactive would gain nothing.
- **Walking with keys is not separately tested.** `walk` assigns `selected` as a click does, and
  the click path (direct switch, and switch after Escape) is covered.
- **A vendor keyword instead of JSON Schema's `examples`.** `schema-form` already turns `examples`
  into a chooser (`DestinationForm.svelte` `listed`), so reusing it would change existing fields.
- **`ARENA_API` moved to `credentials.ts`.** It belongs to the account concern (where an account
  without an address is reached), and the move keeps `api.ts` out of `tests/stage`'s typecheck.
  `apps/relay-arena/src/constants.ts` still has its own copy, which predates this PR.
- **Validation coverage.** Settings (`core/.../lifecycle.ts`, `usability.ts`), accounts
  (`apps/daemon/src/accounts/check.ts`, at startup and on store), arguments (`routing/prepare.ts`,
  `templates/report.ts`) and config.toml payload types (`payload.ts`) all go through the single
  ajv validator, which declares every entry of `ANNOTATIONS`. No path compiles a schema without it.
