import { resolve } from "$app/paths";

import type { IconName } from "$components/primitives/icon/Icon.svelte";

export type Surface = {
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
};

export const SURFACES: readonly Surface[] = [
  { href: resolve("/"), label: "queue", icon: "queue" },
  { href: resolve("/feed"), label: "feed", icon: "feed" },
  { href: resolve("/log"), label: "log", icon: "log" },
  { href: resolve("/settings"), label: "settings", icon: "settings" },
];

/** Current anywhere under it: `settings` is read at a section's own address. */
export function isCurrent(href: string, current: string): boolean {
  return current === href || (href !== "/" && current.startsWith(`${href}/`));
}
