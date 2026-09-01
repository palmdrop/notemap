import { acknowledged, answered, type Api } from "#api/http";
import type { MintTokenRequest, MintedToken, Token } from "#api/types";
import type { TokensApi } from "../types";

export type TokensDeps = {
  readonly api: Api;
};

/**
 * Nothing here is cached and nothing is an outbox operation. A token is minted
 * rarely and read by one screen, and an offline mint would hand somebody a
 * credential the daemon has never heard of.
 */
export function createTokens({ api }: TokensDeps): TokensApi {
  return {
    async list(): Promise<readonly Token[]> {
      return (await answered(api.GET("/v1/tokens"))).values;
    },

    async mint(request: MintTokenRequest): Promise<MintedToken> {
      return answered(api.POST("/v1/tokens", { body: request }));
    },

    async revoke(id: string): Promise<void> {
      await acknowledged(
        api.DELETE("/v1/tokens/{id}", { params: { path: { id } } }),
      );
    },
  };
}
