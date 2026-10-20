# A template that asks for an argument each time it is applied

**Date**: 2026-10-19
**Status**: In progress
**Spec**: `docs/specs/core.md`, `docs/specs/http-v1.md`, `docs/specs/client.md`,
`docs/specs/mirror.md`, `docs/specs/shell.md`

---

## Goal

One template, `todo`, files a capture as a task into `todo.md` under a heading chosen each time.
The heading is picked from the note's own headings, or typed, wherever the template is applied:
the row's tag chooser, the capture box, an item's tags, the process surface and Raycast. A
source-supplied `route/todo` files under the template's default, or is dropped where the template
has none.

Decided in conversation (2026-10-18/19), recorded as
[ADR 63](../adr/0063-a-template-may-ask-for-an-argument-each-time-it-is-applied.md):

- A template field may be **asked**: left open on the template and supplied each time the
  template is applied. It may carry a **label** (falling back to the field's composer word, such as
  `under`) and a **default** (the value the template's `arguments` already hold for it, patterns
  allowed).
- The supplied value travels **beside** the trigger tag, never inside it. The tag stays
  `route/todo`.
- The value is literal. It is merged over the expanded arguments, and the result is validated
  against the capability's schema exactly as a hand-made route's arguments are.
- An enum field is a closed list. An `x-notemap-candidates` field lists the destination's
  candidates (a dependent field asks with the template's own value for what it depends on), and
  also accepts typed text, drawn as its own row. Where the field depended on holds a pattern, there
  is no list, only typed text. A field with neither is free text.
- A trigger tag arriving without a value takes the default. With no default, an interactive tag is
  refused and a capture's tag is dropped, on ADR 34's amendment.
- Input is a second step of the tag chooser's own panel, not a modal. The process surface fills
  asked fields inline in the `place` section, the first one focused when a template is taken.
- No `·` separators in anything the shell draws.

---

## Tasks

### Phase 0: before anything

- [x] Branch `agent/template-arguments` _(2026-10-19)_
- [x] Draft ADR 63, *A template may ask for an argument each time it is applied*. It extends ADR 34
      and amends ADR 35's "expansion is statically total, no second refusal at route time": a
      supplied value can fail the schema, on the same terms a hand-made route's arguments can.
      Include option (a), the value inside the tag (`route/todo/Next`), as considered and refused,
      and why. _(2026-10-19)_
- [x] `CONTEXT.md`: **asked argument**, and the supplied value is just the argument. _(2026-10-19)_
- [x] Wire shapes confirmed: `arguments` on the tag request, a separate map from trigger tag to
      arguments beside `tags` on the capture envelope, `arguments` beside `template` on a route.
      _(2026-10-19)_
- [x] Commit. _(2026-10-19)_

### Phase 1: core

Depends on Phase 0.

- [x] `RoutingTemplateRecord`, `Draft` and `Changes` gain `asked`: field name to `{ label? }`. A
      field's default is whatever `arguments` holds for it, and absence means none. _(2026-10-19)_
- [x] Saving refuses asking for the folder mode or a blank field. Whether the capability declares
      an asked field as a string is the report's to say, since saving asks the destination nothing.
      _(2026-10-19)_
- [x] The template report counts an asked field as filled when it checks for required fields, so
      a template whose only gap is an asked field without a default still `fits`. _(2026-10-19)_
- [x] `requestFor` takes the supplied arguments, merges them over the expanded ones for asked
      fields only, and does not expand them. A supplied value for a field that is not asked is
      refused. An asked field left with no value and no default is refused. A blank value is no
      value. _(2026-10-19)_
- [x] `tag` takes supplied arguments and passes them to `firingFor`. A refusal is
      `trigger-refused`, with a detail saying which field. An absorbed re-tag ignores them, as it
      ignores everything else. _(2026-10-19)_
- [x] A capture's envelope carries supplied arguments per trigger tag. A tag whose firing is
      refused for a missing or invalid value is dropped, as other refusals already are. _(2026-10-19)_
- [x] `routeFrom` takes supplied arguments beside `content`, so a composer route stays a template
      route: the record names the template and the tag is written after it. _(2026-10-19)_
- [x] `template-fired` carries the supplied arguments in its detail, so the status line can say
      `under Next`. _(2026-10-19)_
- [x] Store: the templates table gains `asked` (migration). Mirror: the template record carries it,
      lossless through the codec and the arbitraries. A template has no rendering to name it in.
      _(2026-10-19)_
- [x] Tests: merge and refusal cases in `tests/integration/src/templates.test.ts`. A tag with a value fires a record
      holding it. A tag without one takes the default, and is refused where there is none. A
      capture drops the tag instead. A codec round-trip with `asked`, through the arbitrary.
      _(2026-10-19)_
- [x] `pnpm --filter @notemap/core mutation`, and read the survivors in `pool/templates`. The
      new lifecycle survivors are killed by unit tests; `apply`, `fire`, `report` and `capture`
      are covered from the integration suite, not core's own. _(2026-10-19)_
- [x] Specs: `core.md` (templates, classification), `mirror.md` (template record). _(2026-10-19)_
- [x] Verify: `pnpm -r --no-sort --silent test`, typecheck, lint. Commit. _(2026-10-19)_

### Phase 2: HTTP

Depends on Phase 1.

- [x] Template schemas (record, draft, changes) carry `asked`. The tag request carries optional
      `arguments`. The capture envelope carries the per-tag map. A route from a template carries
      optional `arguments`, and so does a preview. The new refusal codes reach their statuses and
      `/route`'s and `/route/preview`'s declared `422`s. `GET /route/resolve` is unchanged: the
      composer draws asked fields from its own state. _(2026-10-19)_
- [x] OpenAPI regenerated, and `packages/client/src/api/generated.d.ts` with it. The client's
      wording for the three new codes. _(2026-10-19)_
- [x] Tests in `routes/templates.test.ts`, beside the other trigger-tag and template-route cases.
      _(2026-10-19)_
- [x] Spec: `http-v1.md`. _(2026-10-19)_
- [x] Verify: tests, typecheck, lint, then `pnpm test:stack`, since this crosses the HTTP surface.
      Commit. _(2026-10-19)_

### Phase 3: client

Depends on Phase 2.

- [x] The outbox's `tag` operation carries optional `arguments`, applied to the cache as today and
      sent with the request. A capture operation carries the per-tag map. Conflict and opposition
      rules are unchanged: they key on the tag. _(2026-10-19)_
- [x] `client.tag(item, tag, arguments?)`. Routing from a template takes arguments through the
      generated `RouteRequest`. _(2026-10-19)_
- [x] Tests in `outbox/vocabulary.test.ts` and `capture/envelope.test.ts`: a tag sends its
      arguments, and a capture sends only those for tags it carries. Hydration is a JSON round trip
      of the operation and needs nothing new. _(2026-10-19)_
- [x] Spec: `client.md`. _(2026-10-19)_
- [x] Verify: tests, typecheck, lint. Commit. _(2026-10-19)_

### Phase 4: template form and list

Depends on Phase 3.

- [x] In `TemplateForm.svelte`, each field holding text can be marked `ask each time`, with a
      label. The value the field holds becomes its default, and may be left empty. _(2026-10-19)_
- [x] The mark is an `ask` option at the end of the field's line, and the field's label becomes
      the line that renames it, rather than an option row repeated under every field. A line under
      the value says `default` or `no default`. _(2026-10-20)_
- [x] The template line and its opened facts draw an asked field by its label, with the default
      where there is one. _(2026-10-19)_
- [x] Tests in `settings/templates.test.ts`. _(2026-10-19)_
- [x] Spec: `shell.md` § Settings. _(2026-10-19)_
- [x] Verify: tests, typecheck, lint. Commit. _(2026-10-19)_

### Phase 5: the chooser's argument step

Depends on Phase 3. Phase 4 is only needed to make a template that asks without writing one by
hand.

- [x] Taking a trigger tag whose template asks turns the chooser's panel into a step per asked
      field, in dependency order. Each step has a heading naming the template and the field's
      label, the default as the line's placeholder (prefilled would narrow the list to it), and
      the list the field's kind allows (closed enum, candidates with a typed row, or nothing). `⏎`
      takes, `esc` steps back to the tags, and a second `esc` closes without tagging. The tag
      lands with its arguments, as one operation. _(2026-10-19)_
- [x] The same step on the row, in the capture box (the draft holds the values beside the tags,
      and a refused capture put back restores them), and on a row whose edit holds the tag until
      the save. Below `narrow` the panel is a full-width sheet. _(2026-10-19)_
- [-] Pressing a carried tag reopens the step until the capture commits _(dropped — `×` and taking
      the tag again does the same in two presses, and a press on a carried tag already means
      select-for-removal everywhere else)_
- [x] A carried trigger tag with a value reads `route/todo` then `list Next`, label then value,
      where the tag has not gone yet. _(2026-10-19)_
- [x] The status line reads `routing **todo** list Next` while the window is open, and the panel
      says the same. _(2026-10-19)_
- [x] Tests: `Capture.test.ts`, `Queue.test.ts`, `action-log.test.ts`. _(2026-10-19)_
- [x] Spec: `shell.md` § Tagging, § The status line. _(2026-10-19)_
- [x] Verify: tests, typecheck, lint. Commit. _(2026-10-19)_

### Phase 6: the process surface

Depends on Phase 3. Phase 5 can go before or after it.

- [x] Taking a template that asks draws its place read-only with each asked field open inline,
      using the same lists as the chooser step. The first asked field takes the caret. _(2026-10-19)_
- [x] `route` commits as the template, with the arguments. Editing any other field still makes the
      decision the person's own, as today. _(2026-10-19)_
- [x] A trigger tag taken in the surface's tags section takes the template in `place` rather than
      filing at once, wherever the template asks. _(2026-10-19)_
- [x] Tests in `Process.test.ts`. _(2026-10-19)_
- [x] Spec: `shell.md` § The process surface. _(2026-10-19)_
- [x] Verify: tests, typecheck, lint. Commit. _(2026-10-19)_

### Phase 7: Raycast

Depends on Phase 3.

- [x] The capture form reads the templates, and for each chosen trigger tag that asks it draws one
      field per asked field under the tags, titled by its label, the default its first entry or
      its placeholder. A fixed set or what the destination lists is a `Form.Dropdown`, which also
      takes typed text as a `+` entry; anything else a `Form.TextField`. Submitting with an asked
      field empty and no default is refused on the form. Declared trigger tags are offered beside
      those in use. _(2026-10-19)_
      This replaces the pushed `List` sketched in conversation: a form already on screen is
      Raycast's own idiom for "and one more value".
- [x] `lib/note.ts` tags with the arguments. _(2026-10-19)_
- [x] Tests in `lib/asked.test.ts` and `lib/note.test.ts`. _(2026-10-19)_
- [x] Verify: tests, typecheck, lint. Commit. _(2026-10-19)_
- [ ] A manual run in Raycast. _(not done: no Raycast in this session)_

---

## Unknowns

- **A supplied value that looks like a pattern.** Taken literally. That means `{{` is writable
  through an asked field and not through a template, which is a small asymmetry worth naming in the
  ADR rather than fixing.
- **Raycast's dropdown and typed values.** `Form.Dropdown` offers only its items, so the search
  text is added as an item while it matches none. Whether `onSearchTextChange` with `filtering`
  behaves that way inside a form is untested outside Raycast; the fallback is a `Form.TextField`
  with the candidates listed in its `info`.
- **An asked field depending on another asked field** (an asked `path`, then `heading`). The step
  asks with the value just given, which ADR 62's `given` carries. No template does this yet, so
  the chain is tested but not designed for beyond one step.

---

## Testing

ALWAYS CREATE TESTS for the behavior implemented, unless appropriate tests already exist.

---

## Notes

DO NOT IMPLEMENT until clearly stated by the developer.

When told to implement, create a branch named after the plan and work there. Once a phase — or any
sensible set of changes — is done, check off the relevant tasks, `git commit`, and describe what was
added.

When the plan is implemented, fully or partially, set **Status** to `Done` or `In progress`. **Then
add a `Shipped:` entry to every spec listed above**, dated, describing at a high level what landed
and linking back to this plan. No implementation details, no granular tasks. A plan marked Done
whose spec has no matching `Shipped:` entry is an error the `review` skill will flag.
