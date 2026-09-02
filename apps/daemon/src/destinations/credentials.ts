import { readFile } from "node:fs/promises";

import type { Account } from "../config/load";

/**
 * An account resolved whole, as an adapter is handed it. Reading config and
 * secrets is the host's, and this is the whole of what it does with them: no
 * kind is named here, and nothing is decided about the address.
 */
export type ResolvedAccount = {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
};

export type AccountResolver = (name: string) => Promise<ResolvedAccount>;

/**
 * The accounts of one kind, by name. The secret is read when a delivery asks
 * for it rather than at startup, so rotating one is writing the file: a daemon
 * that had read it once would go on presenting the old password until somebody
 * restarted it, which is the opposite of what rotation is for.
 */
export function accountsFor(
  kind: string,
  accounts: readonly Account[],
  env: NodeJS.ProcessEnv = process.env,
): AccountResolver {
  const byName = new Map(
    accounts
      .filter((account) => account.kind === kind)
      .map((account) => [account.name, account]),
  );

  return async (name: string): Promise<ResolvedAccount> => {
    const account = byName.get(name);
    if (account === undefined) {
      throw new Error(`no ${kind} account named ${name} is configured`);
    }

    return {
      baseUrl: account.baseUrl,
      username: account.username,
      password: await secretOf(account, env),
    };
  };
}

async function secretOf(
  account: Account,
  env: NodeJS.ProcessEnv,
): Promise<string> {
  if (account.passwordEnv !== undefined) {
    const value = env[account.passwordEnv];
    if (value === undefined || value === "") {
      throw new Error(
        `${account.passwordEnv} holds no password for the ${account.kind} account ${account.name}`,
      );
    }
    return value;
  }

  const path = account.passwordFile;
  if (path === undefined) {
    // Unreachable: the config refuses an account naming neither.
    throw new Error(
      `the ${account.kind} account ${account.name} says where no password is read from`,
    );
  }

  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (cause) {
    throw new Error(
      `the password for the ${account.kind} account ${account.name} could not be read from ${path}: ${why(cause)}`,
      { cause },
    );
  }

  const password = withoutFinalNewline(contents);
  if (password === "") {
    throw new Error(
      `${path} is empty, so the ${account.kind} account ${account.name} has no password`,
    );
  }
  return password;
}

/**
 * One line ending, and no more: nearly every secret file was written by
 * something that ends its output with a newline, and trimming further would
 * silently change a password that legitimately ends in a space.
 */
function withoutFinalNewline(contents: string): string {
  return contents.replace(/\r?\n$/, "");
}

function why(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
