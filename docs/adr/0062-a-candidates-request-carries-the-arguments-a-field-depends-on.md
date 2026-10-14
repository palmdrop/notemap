# 62. A candidates request carries the arguments a field depends on

**Date**: 2026-10-14
**Status**: Accepted. Supersedes one paragraph of
[ADR 26](0026-a-destination-can-be-asked-what-an-argument-could-hold.md), *A request carries no
arguments filled in so far*, and that ADR's matching neutral consequence. The rest of ADR 26
stands.
**Deciders**: palmdrop, with Claude

---

## Context and problem statement

Filing a capture under a heading means typing the heading exactly as the note spells it. `insertUnder`
matches on the heading's text, and a near miss writes a new `## Heading` at the end of the note
instead of failing. The person should be able to pick from the headings the note actually has.

`heading` cannot be asked about on ADR 26's terms. Which headings exist depends on which note
`path` names, and ADR 26 decided that a request carries no arguments filled in so far. It used this
very pair as its example: "`append-to-file` takes `path` and `heading`, neither pair
interdependent". For listing values, the pair is interdependent. ADR 26 also said what would change
the decision: "the first kind that does pays for the parameter, and for the route shape it forces."
This is that kind.

So how does a request say what the field depends on, and who decides what it depends on?

---

## Decision drivers

- **The route is a `GET`** (ADR 26), so whatever is added has to fit in a query string.
- **A scope is opaque and minted by the destination** in an earlier answer. A caller that builds
  one breaks that promise.
- **No kind-specific vocabulary in the HTTP surface.** ADR 26 chose to ask about a field rather
  than a place, so that folders, notes, tags and columns are one question.
- **A caller has to know when a field becomes askable.** A heading picker offered before `path` is
  filled can only fail, and the shell should know that from the schema, not by trying.
- **Refuse rather than approximate**, as the routing surface does elsewhere.

---

## Considered options

1. **Encode the note in the scope.** The heading field is asked with `scope=docs/todo.md`.
2. **`POST` the whole argument set** to a candidates route, so the destination sees everything
   filled so far.
3. **A route per sort of answer**, such as `/headings?path=…`.
4. **A field declares what it depends on, and the request carries those arguments as `given`.**

---

## Decision outcome

Chosen: **option 4**.

- A field whose answer depends on other arguments says so in its own schema, beside
  `x-notemap-candidates`: `x-notemap-candidates-given: ["path"]`. A field with no such annotation
  is asked exactly as before.
- `CandidatesRequest` gains `given`, a map from argument name to string. On the route each one is a
  query parameter named `given.<field>`:
  `GET …/candidates?capability=append&field=heading&given.path=docs/todo.md`.
- The route checks `given` before the destination is asked anything, on the same terms as the
  capability and field checks it already makes. If an argument the field declares is absent or
  empty, the answer is `422 given-missing`. If an argument it does not declare is present, the
  answer is `422 given-undeclared`. Neither reaches the destination.
- **Values are strings.** A query string carries nothing else, and every field anyone wants to
  depend on today is a path. The first field that depends on a non-string argument decides how to
  carry one.
- Everything else is ADR 26 unchanged: `scope` still descends, entries still carry `value` and
  `scope` independently, and failures are still `answered`, `unreachable`, `unusable` and
  `not-offered`.

**The first use is `heading`** on the markdown kinds' `append` and `create-or-append`, given
`path`. The kind reads the note, parses it as the splice does, and answers one entry per distinct
heading text, with no scope. Headings are listed once, because the splice uses the first match and
a second entry with the same value would offer a choice that does not exist. A note that is not
there yet answers `answered` with no entries, and so does a `create-or-append` path ending in `/`,
whose filename is not derived until delivery. The field still accepts free text, so a heading that
does not exist yet, or a note on a destination that is asleep, can still be routed.

### Option 1 has the caller mint a scope

A scope is the destination's word for "ask again from here". A composer writing `docs/todo.md` into
one has started to know how a kind's scopes are spelled. Also, the first request for a field is the
one with no scope, and for `heading` that request means nothing.

### Option 2 changes the method to send more than is needed

It turns a read into a `POST` and sends every argument when one is needed. It also hides the
dependency: the caller sends everything because it cannot know what matters, and a heading picker
is offered before `path` is filled and fails.

### Option 3 is the vocabulary ADR 26 refused

`/headings` is a place-kind in the URL. A board's swimlanes for a given board would become
`/swimlanes`, and so on for every kind.

### Consequences

- **Good**: the dependency lives in the schema, so the shell knows to offer the picker only once
  `path` is filled, and a refusal for a missing argument is a bug rather than a normal answer.
- **Good**: the destination answers with the arguments it needs and nothing else.
- **Bad**: the client's in-memory candidates cache has to key on `given` as well. A heading list
  cached for one note must never answer for another.
- **Bad**: picking a heading reads the whole note, once per pick. Acceptable for notes people
  write by hand, and capped by `truncated` like any other answer.
- **Neutral**: `x-notemap-candidates-given` is a second annotation where one richer value would
  also have worked. A sibling keeps `x-notemap-candidates: true` meaning what it already means to
  every reader of it.

---

## Pros and cons of the options

### Encode the note in the scope

- **Good**: no change to the request.
- **Bad**: the caller mints what only the destination may mint, and the unscoped first request is
  meaningless.

### `POST` the whole argument set

- **Good**: works for any dependency, of any type.
- **Bad**: a read through a write method, and the dependency is invisible to the caller.

### A route per sort of answer

- **Good**: obvious to read.
- **Bad**: puts a per-kind vocabulary in the HTTP surface.

### `given`, declared by the field

- **Good**: the dependency is declared, checked before the destination is asked, and visible to
  the shell.
- **Bad**: string values only, and a second annotation.

---

## More information

Plan: [task-conversion.md](../plans/task-conversion.md). Revisit when a field depends on a
non-string argument, or when a dependency chain grows longer than one step (a field depending on a
field that depends on another), which `given` can carry but which the composer has never had to
draw.
