import type { ListState } from "@notemap/client";

/** A read the pool refused. One it never answered is not a failure a surface draws. */
export function refusalIn(list: ListState): string | undefined {
  return list.failure?.refused === true ? list.failure.said : undefined;
}
