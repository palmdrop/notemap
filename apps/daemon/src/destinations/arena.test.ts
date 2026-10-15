import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  startArenaServer,
  type ArenaServer,
} from "@notemap/destination-arena/testing";
import { createAjvSchemaValidator } from "@notemap/schema-ajv";

import { createAccounts } from "../accounts";
import { createSqliteAuthStore } from "../auth/store";
import type { AuthStore } from "../auth/store/types";
import type { Account } from "../config/load";
import { ACCOUNT_SCHEMAS, systemClock } from "../ports";
import { captureMany, daemon, send, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];
const servers: ArenaServer[] = [];
const stores: { store: AuthStore; directory: string }[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
  await Promise.all(servers.splice(0).map((it) => it.close()));
  for (const each of stores.splice(0)) {
    await each.store.close();
    rmSync(each.directory, { recursive: true, force: true });
  }
});

async function arena(): Promise<ArenaServer> {
  const server = await startArenaServer();
  servers.push(server);
  return server;
}

/** A daemon whose config declares one are.na account per server, each named for its address. */
async function serving(
  declared: Record<string, ArenaServer | undefined>,
): Promise<Daemon> {
  const directory = mkdtempSync(join(tmpdir(), "notemap-arena-accounts-"));
  const store = createSqliteAuthStore({
    file: join(directory, "auth.db"),
    synchronous: "off",
  });
  stores.push({ store, directory });

  const config: Account[] = Object.entries(declared).map(([name, server]) => ({
    kind: "arena",
    name,
    secretEnv: `TOKEN_${name}`,
    ...(server === undefined ? {} : { baseUrl: server.url }),
  }));
  const env = Object.fromEntries(
    Object.entries(declared).map(([name, server]) => [
      `TOKEN_${name}`,
      server?.token ?? "unused",
    ]),
  );

  const accounts = await createAccounts({
    kinds: ACCOUNT_SCHEMAS,
    schemas: createAjvSchemaValidator(),
    clock: systemClock,
    store,
    config,
    env,
  });

  const host = daemon(undefined, { accounts });
  open.push(host);
  return host;
}

async function routeTo(
  host: Daemon,
  account: string,
  item: string,
): Promise<void> {
  const created = await send(host.app, "/v1/destinations", {
    name: account,
    kind: "arena",
    settings: { account },
  });
  const { id } = (await created.json()) as { id: string };

  const routed = await send(host.app, `/v1/items/${item}/route`, {
    destination: id,
    capability: "create",
    arguments: { channel: "reading" },
  });
  expect(await routed.json()).toMatchObject({ state: "delivered" });
}

describe("an are.na account naming its own address", () => {
  it("is where a delivery for that account lands", async () => {
    const server = await arena();
    const host = await serving({ fake: server });
    const [item] = await captureMany(host.app, 1);

    await routeTo(host, "fake", item as string);

    expect(server.blocks()).toEqual([
      expect.objectContaining({ channel_ids: ["reading"] }),
    ]);
  });

  it("keeps two accounts' deliveries apart", async () => {
    const one = await arena();
    const two = await arena();
    const host = await serving({ one, two });
    const [first, second] = await captureMany(host.app, 2);

    await routeTo(host, "one", first as string);
    await routeTo(host, "two", second as string);

    expect(one.blocks()).toHaveLength(1);
    expect(two.blocks()).toHaveLength(1);
  });
});
