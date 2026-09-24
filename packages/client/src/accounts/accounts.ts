import { answered, type Api } from "#api/http";
import type {
  Account,
  AccountKind,
  PutAccountRequest,
  RemovedAccount,
} from "#api/types";
import type { AccountsApi } from "../types";

export type AccountsDeps = {
  readonly api: Api;
};

/**
 * Nothing here is cached and nothing is an outbox operation, for the reason
 * tokens are not: an account written offline would be a secret sitting in a
 * browser's storage until it drained.
 */
export function createAccounts({ api }: AccountsDeps): AccountsApi {
  const address = (kind: string, name: string) => ({
    params: { path: { kind, name } },
  });

  return {
    async kinds(): Promise<readonly AccountKind[]> {
      return (await answered(api.GET("/v1/account-kinds"))).values;
    },

    async list(): Promise<readonly Account[]> {
      return (await answered(api.GET("/v1/accounts"))).values;
    },

    async put(
      kind: string,
      name: string,
      request: PutAccountRequest,
    ): Promise<Account> {
      return answered(
        api.PUT("/v1/accounts/{kind}/{name}", {
          ...address(kind, name),
          body: request,
        }),
      );
    },

    async remove(kind: string, name: string): Promise<RemovedAccount> {
      return answered(
        api.DELETE("/v1/accounts/{kind}/{name}", address(kind, name)),
      );
    },
  };
}
