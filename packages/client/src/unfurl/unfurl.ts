import { answered, type Api } from "#api/http";
import type { Unfurl } from "#api/types";

export type UnfurlDeps = {
  readonly api: Api;
  /** The pool setting as last read, absent where it has not been. */
  readonly setting: () => boolean | undefined;
};

/** Neither cached nor queued: a link is asked about as it is drawn, and never while offline for later. */
export function createUnfurl(
  deps: UnfurlDeps,
): (url: string) => Promise<Unfurl | undefined> {
  return async (url) => {
    if (deps.setting() !== true) return undefined;
    return answered(deps.api.GET("/v1/unfurl", { params: { query: { url } } }));
  };
}
