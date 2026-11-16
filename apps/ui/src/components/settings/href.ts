import { resolve } from "$app/paths";

export const SECTIONS = [
  { slug: "destinations", label: "Destinations", group: "routing" },
  { slug: "templates", label: "Templates", group: "routing" },
  { slug: "accounts", label: "Accounts", group: "routing" },
  { slug: "pool", label: "Pool settings", group: "the pool" },
  { slug: "access", label: "Access", group: "the pool" },
  { slug: "server", label: "Server", group: "the pool" },
  { slug: "storage", label: "Storage", group: "the pool" },
  { slug: "appearance", label: "Appearance", group: "this device" },
] as const;

export const GROUPS = ["routing", "the pool", "this device"] as const;

export type Section = (typeof SECTIONS)[number]["slug"];

export function isSection(said: string): said is Section {
  return SECTIONS.some((one) => one.slug === said);
}

export function settingsHref(section: Section): string {
  return resolve("/settings/[section]", { section });
}

/** One thing in a section, a destination or a template, on a page of its own. */
export function openHref(section: Section, id: string): string {
  return `${settingsHref(section)}?${new URLSearchParams({ open: id })}`;
}

/** Its form. */
export function editHref(section: Section, id: string): string {
  return `${settingsHref(section)}?${new URLSearchParams({ open: id, edit: "" })}`;
}

/** A new one's form. */
export function newHref(section: Section): string {
  return `${settingsHref(section)}?new`;
}

/** Templates, with the form open on a routing record's decision. */
export function templateFromHref(item: string, record: string): string {
  const query = new URLSearchParams({ item, record });
  return `${settingsHref("templates")}?${query}`;
}
