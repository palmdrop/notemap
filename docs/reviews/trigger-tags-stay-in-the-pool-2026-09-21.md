# Review: Trigger tags stay in the pool

**Date**: 2026-09-21
**Status**: Resolved
**Scope**: `git diff main...HEAD` (PR #71, branch `agent/trigger-tags-stay-in-the-pool`, three commits)
**Spec**: `docs/specs/core.md`, `docs/specs/shell.md`, `docs/standards.md`, `CONTEXT.md`

---

## Overall

The change does what it says. `carriedTags` (`packages/output-markdown/src/tags.ts`) is the one
place a `route/` tag is dropped, both markdown kinds and the are.na kind go through it, and the
preview shares the render path (`destination-fs/src/destination.ts:439`, `destination-webdav/src/notes.ts:299`).
The `hashtags` boolean has no setting that means nothing, and the two annotations are read by the
forms and by nothing in core. Typecheck, `pnpm -r --silent test`, `pnpm lint` and `pnpm test:stack`
are all green.

Two things worth attention. The "nothing already stored breaks" claim is not true as stated: a
destination holding the old `tags` setting goes **unusable** the moment the new build runs, and a
template holding a `tags` argument stops firing — both loudly, both recoverable through the
settings forms, but neither is "nothing breaks". And the untouched-template check in the composer
compares what the form *sends* against what the template *resolved to*, so a template that holds
a value for a field the form has since hidden is quietly committed as the person's own decision,
with no record naming it and no trigger tag put on the item — the exact failure mode
`sameArguments`'s own comment warns about, reintroduced by the conditional field.

No plan file exists for this branch (`docs/plans/trigger-tags-stay-in-the-pool.md`), which the
branch naming convention presupposes.

---

## Bugs

### 1. A hidden field breaks the untouched-template check

`apps/ui/src/components/process/Process.svelte:437` builds `wanted` from `fields` — the offered
subset — and `:443` compares it to `resolved.arguments`, which is whatever the template holds.
When the template holds a value for a field the form is not offering, the two differ and the
route goes out as a decision of the person's own: `applied` is not named on the record, and
`classify()` (`:672`) finds no template and puts no trigger tag on the item.

How a template comes to hold such a value:

```
template saved with { directory, triggerTags: true }, hashtags left to inherit
  → destination's hashtags setting was `true` at the time, so the form offered it
destination setting later flipped to `false` (or frontmatter to `none`)
  → composer: effective hashtags = false, frontmatter = none
  → triggerTags not offered, dropped from `wanted`
  → wanted { directory } ≠ resolved { directory, triggerTags: true }
  → own decision; record names no template; no trigger tag
```

The same happens for a template written over the API with a value the form would hide. Nothing
in the pool forbids either — core does not read `x-notemap-when`, which the spec says is the
point. The held value is inert at delivery (no tags go, so `triggerTags: true` writes nothing),
which makes this worse rather than better: the person changed nothing, the delivery is the
template's, and the record says otherwise.

Fix: compare on the same footing on both sides — drop from `resolved.arguments` every field that
`fields` does not offer before handing it to `sameArguments`, or build `wanted` from `declared`
for the comparison only. Add a `Process.test.ts` case for a resolved template carrying a hidden
field.

---

## Design

### 2. What already stored actually does

The claim to check was that nothing stored breaks. What happens, per shape:

- **A destination with `tags: "frontmatter" | "hashtags" | "none"` in its settings.** Both
  settings schemas carry `additionalProperties: false`
  (`packages/adapters/destination-fs/src/settings.ts:25`, `destination-webdav/src/settings.ts:31`),
  and `usability()` (`packages/core/src/pool/destinations/usability.ts:45`) validates the stored
  settings against the kind's schema on every describe, route and pending delivery. So the
  destination reads `unusable — its settings no longer satisfy the filesystem kind: /tags
  additionalProperties`, every route to it is refused, and every reservation already pending
  against it stalls. Opening it in the settings form and saving heals it: `typed` starts from the
  stored settings (`DestinationForm.svelte:44`) but `valuesFrom(fields, typed)` (`:132`) only
  reads schema fields, so `tags` is dropped on save. What the old value said is lost silently —
  a vault that had `tags: "hashtags"` comes back with tags in its frontmatter until somebody
  picks `hashtags: yes` again, and one that had `tags: "none"` under `frontmatter: full` starts
  writing tags it was told not to.
- **A template with a `tags` argument.** The report (`packages/core/src/pool/templates/report.ts:72`)
  answers `arguments-invalid`; a trigger tag arriving is refused at `prepare.ts:126` on the same
  check. Loud. Editing the template drops the key on save (`TemplateForm.svelte:160` reads
  `typeable` only).
- **A record with a `tags` argument.** History is history. A *pending* one replays
  `record.target.arguments` unvalidated (`packages/core/src/pool/routing/delivery.ts:115`), and
  `hashtagsOf` ignores the unknown key, so it lands with tags wherever the setting now says —
  silently different from what was decided. Only reachable through a reservation that survived a
  daemon upgrade.

Greenfield, no live users, so none of this needs a migration. But the spec's Shipped entry and
the PR should say "stored `tags` settings and arguments are refused until re-saved" rather than
implying continuity. A one-line note in `core.md`'s entry would do.

### 3. `triggerTags` is "false by default" in the docs and has no `default` in the schema

`packages/output-markdown/src/tags.ts:58` declares no `default`; `triggerTagsOf` (`:71`) and
the UI's `comesOutAs` (`apps/ui/src/lib/schema-form.ts:176`, "a flag nobody said anything
about is off") each supply the `false` on their own. `core.md:9` and `:1572` say `false` by
default as if the schema said it, the way `hashtags` does (`tags.ts:26`, `default: false`).

This is load-bearing, not cosmetic. `presetsFrom` (`schema-form.ts:140`) seeds every
non-inheriting field that has a preset, and `triggerTags` does not inherit. Add `default: false`
to match the doc and the composer seeds `triggerTags: "false"` into `args` on every fresh route,
so `valuesFrom` sends an explicit `false` the adapter never needed — and the schema-default
path for a flag stops being the special case `comesOutAs` was written for. Either say in the
schema and the spec that this flag declares no default on purpose, or declare it and teach
`presetsFrom` that a flag's `false` is not worth seeding. As it stands the two readers agree by
coincidence.

### 4. `effectiveOf` judges against fields that are not offered

`apps/ui/src/lib/schema-form.ts:155` computes every field's effective value from what it holds,
whether or not the field is itself offered. Today no condition names a conditional field, so
nothing chains. The moment one does — a field offered while `triggerTags` is `true`, say — a
hidden `triggerTags` that still holds `"true"` in state (the form deliberately keeps it, see
Non-issues) would offer the dependent field while its own condition does not hold. Either
resolve in declaration order and treat an unoffered field as absent, or say in the doc comment
that conditions may only name unconditional fields.

### 5. The condition list is validated only as "an array"

`packages/core/src/pool/destinations/vocabulary.ts:71` declares `x-notemap-when` as
`shape: "array"`, and `validator.ts:47` passes that to ajv as `schemaType`. Nothing checks the
entries are `{ field: string, is: unknown[] }`. A malformed entry — `is: true`, or `fields` —
is dropped by `conditionsOf` (`schema-form.ts:108`), and when all entries are dropped the field
becomes unconditional. The failure a schema author gets for a typo is "the switch is always
there", which is exactly the degenerate offer the annotation exists to prevent. The
`ANNOTATIONS` comment sells the list as what "catches a typo in a hand-written payload type";
for this keyword it does not. ajv's `addKeyword` takes a `metaSchema`; declaring the entry shape
there keeps the guarantee.

---

## Minor

### 6. `shell.md` says the destination form gives an option back and marks the implied one

`docs/specs/shell.md:10-13`: "Taking the option already taken gives it back, in the composer,
on the template form and on the destination form alike … and what absent comes out as is marked
hollow". `DestinationForm.svelte:186` does neither — `onchoose` sets the value without
toggling, and there is no `implied` on its `Option`. It has a blank option labelled
`default (no)` instead, which serves the same need and is arguably clearer for a setting. The
doc should say that; the 2026-09-08 entry it echoes (`shell.md:191`) already overstated it.

### 7. No plan for the branch

`agent/<plan-file-stem>` names `docs/plans/trigger-tags-stay-in-the-pool.md`, which does not
exist. Whether a plan was wanted is your call; the convention says there is one.

### 8. The hollow mark has no accessible form

`apps/ui/src/components/primitives/composer/Option.svelte:39` draws `▹` inside an
`aria-hidden` span. `▸` is covered by `aria-pressed`; nothing says "implied" to a reader that
cannot see the glyph. `aria-description` or a visually hidden "(default)" would do.

### 9. Toggling a required enum field back in the template form leaves it empty

`TemplateForm.svelte:261` now clears a chosen option when it is chosen again, for every fixed
field including a required one. `valuesFrom` then sends `""` and the pool refuses it. The
composer already behaves this way (`Process.svelte:826`), so this is consistency rather than
regression, but the toggle could skip required fields in both.

### 10. Test coverage gaps

- `templates.test.ts`: nothing exercises a conditional field on the template form, an argument
  inheriting from the destination's settings, the hollow mark, or the new toggle-back. Only the
  vocabulary placement is tested.
- `Destinations.test.ts`: no boolean setting — `yes`/`no` labels, `default (no)`, explicit
  `false` in the request.
- `Process.test.ts`: no untouched-template case with a conditional field (Bug 1); no case that
  an inheriting field is not seeded through the composer (the unit test on `presetsFrom` covers
  the function, not the `$effect` at `Process.svelte:227`).
- `destination-arena/src/blocks.test.ts`: nothing shows a `route/` tag left out of the block's
  metadata; `blocks.ts:105` is only exercised through `carriedTags`'s own tests.
- `destination-webdav`: `triggerTagsOf` is wired at `notes.ts:315` with no test on that side.
  The fs kind has none at its level either; both rely on `note.test.ts`.
- `schema-ajv/src/validator.test.ts`: the three annotation tests are all boolean-shaped.
  Nothing shows an array-shaped one is tolerated; the stack suite is what proves it, by routing
  to a real filesystem destination.
- `schema-form.test.ts`: `offered` is tested for each condition holding alone and for one
  holding while the other is false; not for a condition whose `is` has several values, nor for a
  malformed condition (Design 5).

---

## Non-issues

- **`default` on an inheriting argument is safe** — `FRONTMATTER_MODE` and `HASHTAGS_ARGUMENT`
  now carry a `default` the spec says is "never a value to seed". That holds because
  `createAjvSchemaValidator` (`validator.ts:35`) is not given `useDefaults`, so ajv never writes
  the default into a request, and `presetsFrom` skips inheriting fields. Nothing pins the ajv
  option; if it ever changes, both arguments start overriding the setting at the wire.
- **`x-notemap-when` as an OR** — right for this field: tags go somewhere if the block is on
  *or* the foot is on, and each condition is one of those. `offered()` (`schema-form.ts:180`)
  is `some` over `some`, and `core.md:1261` says the same.
- **Explicit `false` vs absent** — `valuesFrom` (`schema-form.ts:246`) sends `false` only for a
  chosen `no` (or a required flag), and absent otherwise; `hashtagsOf` (`tags.ts:37`) lets an
  explicit `false` override a `true` setting. The two agree, and the doc's "off is a thing a
  person says, not what silence means" is what the code does.
- **A hidden field keeps its held value in state** — `Process.svelte:176` filters `declared` for
  drawing and sending but leaves `args` alone, so toggling hashtags off and on brings
  `triggerTags` back as it was. Deliberate, and the test at `Process.test.ts:1293` proves the
  held value is not sent while hidden.
- **The UI knows no field by name** — `grep` for `frontmatter|hashtags|triggerTags` under
  `apps/ui/src` (non-test) finds only a section label. `OWN_ARGUMENTS = ["folder"]` predates this.
- **A tag named exactly `route/`** — `carriedTags` drops it with the rest. Core refuses it as a
  trigger tag but not as an ordinary tag, and `core.md:1570` says "every tag under `route/`,
  declared or not", so this is the documented shape.
- **The are.na confession** — `droppedBy` (`blocks.ts:118`) still says "its tags" for an item
  whose only tag was a `route/` one, and that it went into metadata, where it did not. The
  block carries no tags in any case; pre-existing wording, and the metadata is best-effort by
  its own comment.
- **`fixedFrontmatter` taking `tags` as a parameter** rather than reading `delivery.tags` — the
  are.na kind is a second caller with a different answer for `triggerTags`, so the choice
  belongs to the caller. Right seam.

---

## Resolution

Addressed on the branch, 2026-09-21:

1. **Bug 1** — `requestFor` compares against `resolved.arguments` narrowed to the offered fields
   (`Process.svelte`, `offeredOf`). Test: "a template holding a field the form does not offer is
   still untouched", shown failing before the fix.
2. **Design 2** — core.md's Shipped entry now says stored `tags` settings and arguments are
   refused until re-saved. No migration, on purpose.
3. **Design 3** — the schema declares no `default` on purpose and says so in its comment; core.md
   says "absent is off" in both places rather than "false by default".
4. **Design 4** — `effectiveOf` resolves in schema order and treats a field that is not offered as
   untyped. Test for a chained condition.
5. **Design 5** — every `ANNOTATIONS` entry carries the schema its value must satisfy;
   `x-notemap-when` requires a non-empty list of `{ field: string, is: non-empty array }`, and the
   validator hands it to ajv as `metaSchema`. Tests for the accepted and four malformed shapes.
6. **Minor 6** — shell.md says the destination form keeps its blank `default (no)` option.
7. **Minor 7** — left as is: the plan was skipped on request.
8. **Minor 8** — an implied option carries a visually hidden `(default)`.
9. **Minor 9** — neither form gives a required field back to nothing.
10. **Tests** — template form (inherit, hollow mark, conditional, toggle-back), destination form
    (boolean setting, conditional setting), arena `route/` exclusion, fs and WebDAV `triggerTags`
    at the kind level, schema-ajv array annotation, schema-form multi-value `is`.
