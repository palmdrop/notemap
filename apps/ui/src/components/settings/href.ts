import { resolve } from "$app/paths";

export const SECTIONS = [
  { slug: "destinations", label: "Destinations" },
  { slug: "accounts", label: "Accounts" },
  { slug: "templates", label: "Templates" },
  { slug: "access", label: "Access" },
  { slug: "server", label: "Server" },
  { slug: "appearance", label: "Appearance" },
  { slug: "pool", label: "Pool settings" },
] as const;

export type Section = (typeof SECTIONS)[number]["slug"];

export function isSection(said: string): said is Section {
  return SECTIONS.some((one) => one.slug === said);
}

export function settingsHref(section: Section): string {
  return resolve("/settings/[section]", { section });
}
