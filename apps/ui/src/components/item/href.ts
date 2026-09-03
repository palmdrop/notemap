/** Where one item is read. The shell's first address for a thing rather than a surface. */
export function itemHref(id: string): string {
  return `/items/${id}`;
}

/** A record is an item's detail, and its address says so. */
export function recordHref(item: string, record: string): string {
  return `${itemHref(item)}/records/${record}`;
}
