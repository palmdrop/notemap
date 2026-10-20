# 63. A template may ask for an argument each time it is applied

**Date**: 2026-10-19
**Status**: Accepted. Extends
[ADR 34](0034-a-routing-template-is-a-saved-decision-and-a-tag-applies-it.md) and amends one
promise of [ADR 35](0035-a-templates-arguments-are-patterns-expanded-when-the-decision-is-made.md):
that a template which saved never meets a refusal at route time.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

A todo list is one note with many headings, and they change often. Filing a capture as a task under
one of them is a template's job ([ADR 61](0061-a-conversion-is-a-named-argument-a-kind-publishes.md)),
but a template fixes every argument, so it fixes the heading too. One template per heading means a
template to make, rename or delete every time the note is reorganised.

The process surface already lets a person take the template, open `edit` and pick the heading. That
commits as a decision of their own, though: the record does not name the template and the trigger
tag is not written. The quick gestures (a tag on the row, in the capture box, from a source) have
nowhere to put a heading at all.

So how does a template leave one argument to be decided each time, and how does that value reach
the pool when the template is applied by a tag?

---

## Decision drivers

- **The quick gesture is a tag.** A template is applied by its trigger tag from the row, the capture
  box and a source. Whatever carries the value has to work from all three, offline included.
- **Headings churn.** Whatever offers values must read them from the note as it stands today.
- **A tag is classification.** It stays on the item and is offered back to every chooser as a tag in
  use.
- **Nothing expands to a value a person typed** (ADR 35). A tag reaching an argument would be that.
- **Core holds no formats.** The open field cannot be a heading in core's eyes; it is a field of
  the capability's schema.

---

## Considered options

1. **The value inside the tag**: `route/todo/Next`, the template claiming the `route/todo` prefix
   and binding the rest of the tag to `heading`.
2. **The value beside the tag**: the tag stays `route/todo`, and the tagging carries the value.
3. **No argument, only the composer**: taking a template in the process surface leaves its fields
   editable and still commits as the template. Nothing for the quick gestures.

---

## Decision outcome

Chosen: **option 2**.

A template's field may be **asked**: named in the template's `asked`, with an optional **label** a
person reads in place of the field's own name. Its **default** is whatever the template's arguments
already hold for it, patterns included, and a field the arguments leave out has none. *(Amended
2026-10-20: nor does one they hold blank, as a blank supplied value is no value.)* Only a field
the capability's schema declares as a string may be asked. Saving cannot check that without asking
the destination, so the template's report says so instead, and saving refuses only the folder mode,
which is core's to write.

**The value is the argument, not a pattern.** It is merged over the expanded arguments, for asked
fields only, and is never expanded itself. The merged set is then validated against the
capability's schema exactly as a hand-made route's is. A value for a field the template does not
ask is refused, and so is an asked field left with neither a value nor a default.

**Tagging carries the value beside the tag.** The tag request takes `arguments`, and a capture
carries a map from trigger tag to arguments beside `tags`. The tag itself is unchanged, so it is
still one tag in use and still reads as the template that filed the item. A source that can send
only tags sends none, and gets the default. Without one, the firing is refused, which drops the tag
from a capture on the terms ADR 34's amendment set.

**The composer applies an asked template as the template.** `route` from a template takes the same
`arguments`, so the record names the template and the trigger tag is written after it, as it is for
a template that asks nothing.

**What offers values is the field's own kind.** A field with an `enum` is a closed list. A field
the destination can list (`x-notemap-candidates`) offers that list, asking with the template's own
values for anything it depends on ([ADR 62](0062-a-candidates-request-carries-the-arguments-a-field-depends-on.md)),
and still accepts typed text. Where the field depended on holds a pattern there is nothing to ask
with, so the field is typed. Anything else is typed.

### Option 1 puts an argument in classification

Every heading ever used becomes a tag in use, so the chooser keeps offering `route/todo/Ideas` long
after the heading was renamed. A typo is a new tag that files under a heading nobody has, which the
splice then writes. A tag foot cannot hold `Next up`. Trigger tags would need a prefix-uniqueness
rule. Its one advantage, that a relay could supply the value with no change, is the case a default
already covers.

### Option 3 leaves the quick gestures out

It is half of what is wanted. The composer part of it is in this decision anyway.

### Consequences

- **Good**: one template serves every heading, and the heading is chosen from the note as it is.
- **Good**: the record holds the concrete arguments, so nothing that reads records changes.
- **Bad**: a template that saved can now be refused at route time, when the value it was given does
  not fit. This is the refusal a hand-made route already has, met when the value is given rather
  than a week later. ADR 35's promise still holds for every template that asks nothing.
- **Bad**: a trigger tag can be refused or dropped for a reason that is about a value rather than
  the template, and an interactive tag can now need a second step before it lands.
- **Bad**: an item already filed by `route/todo` cannot be filed again under another heading by the
  tag, which is absorbed. A second heading goes through the process surface.
- **Neutral**: a supplied value is taken literally, so `{{` can reach a record through an asked
  field but not through a template. Nothing writes `{{` into a heading on purpose.

---

## More information

Plan: [template-arguments.md](../plans/template-arguments.md). Revisit if an asked field ever wants
a value that is not a string, or if a source turns out to need to choose the value, at which point
option 1's prefix becomes worth weighing again as sugar over this rather than instead of it.
