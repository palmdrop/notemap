import { parseArgs } from "node:util";

import type { Timestamp } from "@notemap/core";

import type { Token, TokenId } from "../auth/types";
import { instant, toTimestamp } from "../schemas/timestamp";
import { withAuth } from "./open";

const NEVER = "never";

const readExpiry = (value: string): Timestamp => {
  const parsed = instant.safeParse(value);

  if (!parsed.success) {
    throw new Error(
      `${value} is not an instant. Write it as 2026-11-30T09:00:00Z, or as a date alone.`,
    );
  }

  return toTimestamp(parsed.data);
};

export async function mintToken(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      config: { type: "string" },
      name: { type: "string" },
      expires: { type: "string" },
    },
    strict: true,
  });

  const name = values.name;
  if (name === undefined || name === "") {
    throw new Error("minting a token needs --name <name>");
  }

  const expiresAt =
    values.expires === undefined ? undefined : readExpiry(values.expires);

  await withAuth(async (auth) => {
    const minted = await auth.mintToken(name, expiresAt);

    // The token itself on its own line and nothing else, so a script can take
    // it. This is the only time it is readable: the daemon stored a hash.
    console.error(`notemap: ${name} is minted, and shown here only once`);
    console.log(minted.token);
  }, values.config);
}

const columns = (token: Token): readonly string[] => [
  token.id,
  token.name,
  token.createdAt,
  token.expiresAt ?? NEVER,
  token.lastUsedAt ?? NEVER,
];

const HEADINGS = ["id", "name", "created", "expires", "last used"] as const;

export async function listTokens(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { config: { type: "string" } },
    strict: true,
  });

  await withAuth(async (auth) => {
    const held = await auth.listTokens();

    if (held.length === 0) {
      console.log("notemap: no access tokens");
      return;
    }

    const rows = [[...HEADINGS], ...held.map((token) => [...columns(token)])];
    const widths = HEADINGS.map((_, index) =>
      Math.max(...rows.map((row) => (row[index] ?? "").length)),
    );

    for (const row of rows) {
      console.log(
        row
          .map((cell, index) => cell.padEnd(widths[index] ?? 0))
          .join("  ")
          .trimEnd(),
      );
    }
  }, values.config);
}

export async function revokeToken(argv: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { config: { type: "string" } },
    allowPositionals: true,
    strict: true,
  });

  const id = positionals[0];
  if (id === undefined) throw new Error("revoking a token needs its id");

  await withAuth(async (auth) => {
    // `/v1` answers 204 either way, deliberately. Here a typo is worth saying
    // out loud: nobody revokes an id they did not mean to name.
    const held = await auth.listTokens();
    if (!held.some((token) => token.id === id)) {
      throw new Error(`no access token is filed under ${id}`);
    }

    await auth.revokeToken(id as TokenId);

    console.log(`notemap: ${id} is revoked, and stops working at once`);
  }, values.config);
}
