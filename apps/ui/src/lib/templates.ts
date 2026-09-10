import type { RoutingTemplate } from "@notemap/client";

import { client } from "./client";
import { placeNamed, type Namer } from "./routing";

/**
 * What a template says about where it files, in its own words — patterns and
 * all. Never expanded here: what a pattern comes out as is the pool's to say,
 * and a second expander on this side is the drift ADR 35 refused.
 *
 * Read off the arguments rather than off the capability, on the terms a routing
 * record's place is already read: this page draws from pool state and has asked
 * no destination what its fields mean, and a destination that files to
 * something other than a path has a place worth drawing too.
 */
export function placeOf(template: RoutingTemplate, called?: Namer): string {
  return placeNamed(template.arguments, called) ?? "—";
}

/**
 * A template's name as it stands, for somewhere no component is reading. On
 * `nameOf`'s terms for a destination: an id says nothing a person can read, and
 * one that was never loaded is unnamed rather than shown.
 */
export function nameOf(id: string): string {
  return (
    client.templates.held.find((one) => one.id === id)?.name ?? "a template"
  );
}

/** The templates whose trigger tag is this tag, if any: what marks one in a chooser. */
export function triggeredBy(tag: string): RoutingTemplate | undefined {
  return client.templates.held.find((one) => one.triggerTag === tag);
}

/**
 * The tags a chooser offers, with every trigger tag among them. What is *in
 * use* is what the pool has seen on an item, and a tag that has never filed
 * anything has never been seen — so a template set up this morning could only
 * be fired by typing its tag exactly right, which is the one time nobody knows
 * it. A declared trigger tag is offerable the moment it is declared.
 */
export function offerable(inUse: readonly string[]): readonly string[] {
  const declared = client.templates.held.flatMap((one) =>
    one.triggerTag === undefined || inUse.includes(one.triggerTag)
      ? []
      : [one.triggerTag],
  );

  return [...declared, ...inUse];
}
