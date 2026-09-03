import { resolve } from "$app/paths";

/** Where one item is read. The shell's first address for a thing rather than a surface. */
export function itemHref(id: string): string {
  return resolve("/items/[id]", { id });
}

/** A record is an item's detail, and its address says so. */
export function recordHref(item: string, record: string): string {
  return resolve("/items/[id]/records/[recordId]", {
    id: item,
    recordId: record,
  });
}
