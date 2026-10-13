import { answered, type Api } from "#api/http";
import type { StorageApi } from "../types";

/**
 * A plain read every time, holding nothing. The daemon already remembers the
 * measurement and says when it took it, so a copy here would be a third answer
 * to one question — and the rest is a fact about a disk this moment, which
 * nothing can be remembered about.
 */
export function createStorage(api: Api): StorageApi {
  return {
    async read() {
      return answered(api.GET("/v1/storage"));
    },

    async measure() {
      return answered(api.POST("/v1/storage/measure"));
    },

    async reclaim() {
      return answered(api.POST("/v1/reclaim"));
    },
  };
}
