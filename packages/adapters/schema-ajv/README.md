# @notemap/schema-ajv

Core's `SchemaValidator` port over [ajv](https://ajv.js.org). Every host needs one: a payload
type declares a JSON Schema for its content, and core refuses a capture whose payload does not
satisfy it.

## The 2020-12 dialect

ajv ships one build per JSON Schema draft, and this adapter uses `ajv/dist/2020` —
**draft 2020-12**, which is also the dialect OpenAPI 3.1 embeds. The daemon serves an OpenAPI
document and reads payload-type schemas from its config, so a single dialect means the two
cannot disagree in the corners. Nothing in the specs pinned a draft; this is the adapter's
choice, and moving it is a one-line change plus whatever config it invalidates.

## What a `SchemaIssue` keeps, and what it drops

Core's `SchemaIssue` is `{ path, keyword }` — which rule failed, and where. ajv reports more:
a `message`, and `params` carrying the rule's operands (the limit a `minLength` broke, the
enum a value was not in). **Those are dropped.** A refusal carries facts and never a sentence
([core.md](../../../docs/specs/core.md#constraints)), and the path plus the keyword is the
fact; a client that wants "must be at least 1 character" has the keyword to write it from and
the schema to read the limit out of.

This was checked against the widening escape hatch the plan left open, and the type did not
need widening. If a keyword ever appears whose failure is unintelligible without its params,
that is the moment to revisit `SchemaIssue` in core rather than to flatten something lossily
here.

Two mappings are not just `instancePath`, because ajv reports `required` and
`additionalProperties` against the **parent** object. Both name the property from `params`
instead, so a client reading `path` always gets the value the issue is actually about.

## Per instance, never module-level

`createAjvSchemaValidator()` constructs its own ajv. Core is instantiated per pool, and ajv
caches compiled schemas by `$id`; one shared instance would let two pools that use the same
`$id` for different schemas either collide on registration or silently answer with the other's
rules. There is a test for exactly that.

`allErrors` is forced on — core's `payload-invalid` carries every issue, and ajv stops at the
first without it.

## No `close()`

It holds nothing open. Only ports that hold something declare one
([core.md](../../../docs/specs/core.md#constraints)).

## A schema the host got wrong throws

ajv's strict mode is left at its default, so an unknown keyword or an impossible schema raises
rather than passing silently. That is a configuration mistake, not a payload that failed
validation, and the port has no channel for it: `validate` returns the issues a *value* has.
Failing loudly at the first capture is better than a payload type that validates nothing.
