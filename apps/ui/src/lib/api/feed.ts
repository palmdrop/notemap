import { api } from "./client";
import { readError } from "./errors";
import type { Item } from "./types";

const PAGE = 25;

export type FeedPage = {
  readonly items: readonly Item[];
  /** Absent on the last page. */
  readonly after?: string;
};

/** The slice hands back a ready-made URL; the typed client takes parameters. */
function afterIn(next: string): string | undefined {
  return new URL(next, "http://feed").searchParams.get("after") ?? undefined;
}

export async function getFeed(after?: string): Promise<FeedPage> {
  const { data, error } = await api.GET("/v1/feed", {
    params: {
      query: {
        order: "newest-first",
        limit: String(PAGE),
        ...(after === undefined ? {} : { after }),
      },
    },
  });

  if (error !== undefined) throw new Error(readError(error));

  return {
    items: data.values,
    ...(data.next === undefined ? {} : { after: afterIn(data.next) }),
  };
}
