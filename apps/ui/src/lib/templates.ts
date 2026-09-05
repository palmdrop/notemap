import type { RoutingTemplate } from "@notemap/client";

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
