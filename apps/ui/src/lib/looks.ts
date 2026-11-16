import type { RoutingTemplate } from "@notemap/client";

import type { IconName } from "$components/primitives/icon/Icon.svelte";

import { nameOf } from "./destinations";
import { placeOf } from "./templates";

/** A destination's icon, by its kind. */
export function kindIcon(kind: string | undefined): IconName {
  if (kind === "webdav") return "cloud";
  if (kind === "arena") return "grid";
  if (kind === "filesystem") return "folder";
  return "file";
}

/** A template's icon: a note it appends to, or where it files. */
export function templateIcon(
  template: Pick<RoutingTemplate, "capability">,
  kind: string | undefined,
): IconName {
  return template.capability === "append" ? "file" : kindIcon(kind);
}

/** Where a template files, said under its name: "todo.md in Vault". */
export function whereOf(template: RoutingTemplate): string {
  const place = placeOf(template).replace(/,? ?asks each time$/, "");
  return place === "" || place === "—"
    ? nameOf(template.destination)
    : `${place} in ${nameOf(template.destination)}`;
}
