import type { Clock, PoolPorts } from "@notemap/core";

import type { AuthStore } from "../auth/store/types";
import type { Account } from "../config/load";
import {
  accountIssues,
  refuseUnusableAccounts,
  type AccountKinds,
} from "./check";
import { fieldsOf } from "./fields";
import { secretOf } from "./secret";
import type { Accounts, HeldAccount, KnownAccount } from "./types";

export type {
  AccountInput,
  AccountKind,
  AccountRefusal,
  Accounts,
  HeldAccount,
  KnownAccount,
} from "./types";
export type { AccountKinds } from "./check";
export { fieldsOf } from "./fields";

type AccountsConfig = {
  readonly kinds: AccountKinds;
  readonly schemas: PoolPorts["schemas"];
  readonly clock: Clock;
  /** Absent is a daemon holding no accounts of its own, only what config declares. */
  readonly store?: Pick<
    AuthStore,
    "listAccounts" | "getAccount" | "putAccount" | "deleteAccount"
  >;
  readonly config: readonly Account[];
  readonly env?: NodeJS.ProcessEnv;
};

/**
 * Stored first, config second, and whole: a stored account replaces a config
 * one of the same kind and name rather than filling in its gaps. Refuses to
 * open over a config account its kind would not take.
 */
export async function createAccounts({
  kinds,
  schemas,
  clock,
  store,
  config,
  env = process.env,
}: AccountsConfig): Promise<Accounts> {
  refuseUnusableAccounts(kinds, config, schemas);

  const fromConfig = config.map(knownFromConfig);
  let stored: readonly KnownAccount[] = [];

  // Every write below goes through here, so the listing is reloaded after each
  // rather than kept in step by hand.
  const load = async () => {
    stored =
      (await store?.listAccounts())?.map((each): KnownAccount => ({
        ...each,
        from: "stored",
      })) ?? [];
  };

  await load();

  const same = (kind: string, name: string) => (each: KnownAccount) =>
    each.kind === kind && each.name === name;

  const list = () => [
    ...stored,
    ...fromConfig.filter((each) => !stored.some(same(each.kind, each.name))),
  ];

  const shadowed = () =>
    fromConfig.filter((each) => stored.some(same(each.kind, each.name)));

  const declared = (kind: string, name: string) =>
    config.find((each) => each.kind === kind && each.name === name);

  return {
    kinds: () =>
      Object.entries(kinds).map(([name, accountSchema]) => ({
        name,
        accountSchema,
      })),
    list,
    names: (kind) =>
      list()
        .filter((each) => each.kind === kind)
        .map((each) => each.name),
    shadowed,
    resolve: async (kind, name): Promise<HeldAccount> => {
      const held = await store?.getAccount(kind, name);
      if (held !== undefined) {
        return { ...held.fields, kind, name, secret: held.secret };
      }

      const account = declared(kind, name);
      if (account === undefined) {
        throw new Error(`no ${kind} account named ${name} is configured`);
      }

      return { ...account, secret: await secretOf(account, env) };
    },
    secretSet: async (account) => {
      if (account.from === "stored") return true;

      const held = declared(account.kind, account.name);
      if (held === undefined) return false;

      return secretOf(held, env).then(
        () => true,
        () => false,
      );
    },
    put: async ({ kind, name, fields, secret }) => {
      const schema = kinds[kind];
      if (schema === undefined) {
        return {
          ok: false,
          refusal: { kind: "unknown-account-kind", accountKind: kind },
        };
      }

      const issues = accountIssues(schema, fields, schemas);
      if (issues.length > 0) {
        return { ok: false, refusal: { kind: "invalid-account", issues } };
      }

      if (store === undefined) {
        throw new Error("this daemon holds no accounts of its own");
      }

      const kept = secret ?? (await store.getAccount(kind, name))?.secret;
      if (kept === undefined) {
        return { ok: false, refusal: { kind: "account-secret-missing" } };
      }

      const changedAt = clock.now();
      await store.putAccount({ kind, name, fields, secret: kept, changedAt });
      await load();

      return {
        ok: true,
        value: { kind, name, fields, from: "stored", changedAt },
      };
    },
    remove: async (kind, name) => {
      if (kinds[kind] === undefined) {
        return {
          ok: false,
          refusal: { kind: "unknown-account-kind", accountKind: kind },
        };
      }

      if (store === undefined || !stored.some(same(kind, name))) {
        return {
          ok: false,
          refusal: { kind: "no-such-account", accountKind: kind, name },
        };
      }

      await store.deleteAccount(kind, name);
      await load();

      const revealed = fromConfig.find(same(kind, name));
      return { ok: true, value: revealed === undefined ? {} : { revealed } };
    },
  };
}

function knownFromConfig(account: Account): KnownAccount {
  return {
    kind: account.kind,
    name: account.name,
    fields: fieldsOf(account),
    from: "config",
  };
}
