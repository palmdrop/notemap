import { answered, type Api } from "../api/http";
import type { TagUse } from "../api/types";
import type { TagsApi } from "../types";
import type { Observable } from "rxjs";

export type TagsDeps = {
  readonly api: Api;
  /** The set completion offers, for a shell to filter while the pool is out of reach. */
  readonly inUse: Observable<readonly TagUse[]>;
  readonly cached: (tags: readonly TagUse[]) => void;
};

/**
 * Held whole rather than asked per keystroke: the set is small, filtering it is
 * the shell's, and a client that cannot reach the pool still completes.
 */
export function createTags(deps: TagsDeps): TagsApi {
  return {
    inUse: deps.inUse,

    async load(): Promise<readonly TagUse[]> {
      const answer = await answered(deps.api.GET("/v1/tags"));
      deps.cached(answer.values);
      return answer.values;
    },
  };
}
