import type { Branded } from "../branded";
import type { TagName } from "./ids";

/**
 * The tags a surface is read through, every one of which an item must carry.
 * Branded because only `tagFilter` makes one, so a store is never handed a
 * name that was not trimmed, or the same name twice.
 */
export type TagFilter = Branded<readonly TagName[], "TagFilter">;
