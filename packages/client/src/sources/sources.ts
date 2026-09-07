import { answered, type Api } from "#api/http";
import type { SourcesApi } from "../types";

/**
 * A plain read every time. Nothing caches it: what a settings screen asks this
 * for is whether a source has gone quiet, and a remembered answer cannot say.
 */
export function createSources(api: Api): SourcesApi {
  return {
    async inUse() {
      return (await answered(api.GET("/v1/sources"))).values;
    },
  };
}
