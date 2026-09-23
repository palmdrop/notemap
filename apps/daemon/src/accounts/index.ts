import type { JsonObject } from "@notemap/core";

import type { AuthStore } from "../auth/store/types";
import type { Account } from "../config/load";
import { isSecretSource } from "../config/load";
import { secretOf } from "./secret";
import type { Accounts, HeldAccount, KnownAccount } from "./types";

export type { Accounts, HeldAccount, KnownAccount } from "./types";

type AccountsConfig = {
  /** Absent is a daemon holding no accounts of its own, only what config declares. */
  readonly store?: Pick<AuthStore, "listAccounts" | "getAccount">;
  readonly config: readonly Account[];
  readonly env?: NodeJS.ProcessEnv;
};

/**
 * Stored first, config second, and whole: a stored account replaces a config
 * one of the same kind and name rather than filling in its gaps.
 */
export async function openAccounts({
  store,
  config,
  env = process.env,
}: AccountsConfig): Promise<Accounts> {
  const fromConfig = config.map(knownFromConfig);
  let stored: readonly KnownAccount[] = [];

  const load = async () => {
    stored =
      (await store?.listAccounts())?.map((each): KnownAccount => ({
        ...each,
        from: "stored",
      })) ?? [];
  };

  await load();

  const isStored = (kind: string, name: string) =>
    stored.some((each) => each.kind === kind && each.name === name);

  const list = () => [
    ...stored,
    ...fromConfig.filter((each) => !isStored(each.kind, each.name)),
  ];

  return {
    list,
    names: (kind) =>
      list()
        .filter((each) => each.kind === kind)
        .map((each) => each.name),
    shadowed: () => fromConfig.filter((each) => isStored(each.kind, each.name)),
    resolve: async (kind, name): Promise<HeldAccount> => {
      const held = await store?.getAccount(kind, name);
      if (held !== undefined) {
        return { ...held.fields, kind, name, secret: held.secret };
      }

      const declared = config.find(
        (each) => each.kind === kind && each.name === name,
      );
      if (declared === undefined) {
        throw new Error(`no ${kind} account named ${name} is configured`);
      }

      return { ...declared, secret: await secretOf(declared, env) };
    },
  };
}

function knownFromConfig(account: Account): KnownAccount {
  const { kind, name, ...rest } = account;
  const fields: JsonObject = Object.fromEntries(
    Object.entries(rest).filter(([key]) => !isSecretSource(key)),
  );

  return { kind, name, fields, from: "config" };
}
