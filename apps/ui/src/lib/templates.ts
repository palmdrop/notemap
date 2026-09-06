import type { RoutingTemplate } from "@notemap/client";

import { client } from "./client";

/** The field each file-writing capability puts its place in. */
const PLACE_FIELDS: Readonly<Record<string, string>> = {
  "create-file": "directory",
  "append-to-file": "path",
  "create-or-append-file": "path",
};

/**
 * What a template says about where it files, in its own words — patterns and
 * all. Never expanded here: what a pattern comes out as is the pool's to say,
 * and a second expander on this side is the drift ADR 35 refused.
 */
export function placeOf(template: RoutingTemplate): string {
  const field = PLACE_FIELDS[template.capability];
  const place = field === undefined ? undefined : template.arguments[field];

  return typeof place === "string" && place !== ""
    ? place
    : JSON.stringify(template.arguments);
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
