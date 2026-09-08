import { readFile } from "node:fs/promises";

import type { Account } from "../config/load";

/**
 * An account as its kind's schema saw it, with the secret read. What the
 * adapter does with it is its own: reading config and secrets is the host's,
 * and this is the whole of what it does with them — no kind is named here, and
 * nothing is decided about the address.
 */
export type HeldAccount = Account & { readonly secret: string };

export type AccountResolver = (name: string) => Promise<HeldAccount>;

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

  return async (name: string): Promise<HeldAccount> => {
    const account = byName.get(name);
    if (account === undefined) {
      throw new Error(`no ${kind} account named ${name} is configured`);
    }

    return { ...account, secret: await secretOf(account, env) };
  };
}

/**
 * Wherever the account said, in whichever word its kind uses for a secret. The
 * suffix is what this reads: config refused an account that names neither, and
 * one that names both.
 */
export async function secretOf(
  account: Account,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const at = `the ${account.kind} account ${account.name}`;
  const [key, held] = sourceOf(account, at);

  if (key.endsWith("Env")) {
    const value = env[held];
    if (value === undefined || value === "") {
      throw new Error(`${held} holds no secret for ${at}`);
    }
    return value;
  }

  let contents: string;
  try {
    contents = await readFile(held, "utf8");
  } catch (cause) {
    throw new Error(
      `the secret for ${at} could not be read from ${held}: ${why(cause)}`,
      { cause },
    );
  }

  const secret = withoutFinalNewline(contents);
  if (secret === "") {
    throw new Error(`${held} is empty, so ${at} has no secret`);
  }
  return secret;
}

function sourceOf(account: Account, at: string): [string, string] {
  for (const [key, value] of Object.entries(account)) {
    if (!key.endsWith("File") && !key.endsWith("Env")) continue;
    if (typeof value === "string") return [key, value];
  }

  // Unreachable: the config refuses an account naming no source.
  throw new Error(`${at} says where no secret is read from`);
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
