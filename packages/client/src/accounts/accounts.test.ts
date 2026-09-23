import { describe, expect, it } from "vitest";

import { Refused } from "../errors";
import { json, mockTransport, refusal } from "../testing/transport";
import { createApi } from "#api/http";
import { createAccounts } from "./accounts";

const ACCOUNT = {
  kind: "webdav",
  name: "nextcloud",
  fields: {
    baseUrl: "https://cloud.example/remote.php/dav/files/alice",
    username: "alice",
  },
  from: "stored",
  shadowed: false,
  secretSet: true,
  changedAt: "2026-09-23T09:00:00.000Z",
};

const over = (handler: Parameters<typeof mockTransport>[0]) => {
  const transport = mockTransport(handler);
  return {
    accounts: createAccounts({ api: createApi(transport) }),
    transport,
  };
};

const last = (transport: ReturnType<typeof mockTransport>) =>
  transport.sent[transport.sent.length - 1] as Request;

describe("the accounts the daemon reaches other systems with", () => {
  it("are listed", async () => {
    const { accounts } = over(() => json(200, { values: [ACCOUNT] }));

    expect(await accounts.list()).toEqual([ACCOUNT]);
  });

  it("come in kinds, each with the schema a form is built from", async () => {
    const { accounts, transport } = over(() =>
      json(200, { values: [{ name: "arena", accountSchema: {} }] }),
    );

    expect(await accounts.kinds()).toEqual([
      { name: "arena", accountSchema: {} },
    ]);
    expect(new URL(last(transport).url).pathname).toBe("/v1/account-kinds");
  });

  it("are written by kind and name, the secret in the body", async () => {
    const { accounts, transport } = over(() => json(200, ACCOUNT));

    await accounts.put("webdav", "nextcloud", {
      fields: ACCOUNT.fields,
      secret: "app-password",
    });

    const sent = last(transport);
    expect(sent.method).toBe("PUT");
    expect(new URL(sent.url).pathname).toBe("/v1/accounts/webdav/nextcloud");
    expect(await sent.clone().json()).toEqual({
      fields: ACCOUNT.fields,
      secret: "app-password",
    });
  });

  it("are removed by kind and name, answering what took over", async () => {
    const { accounts, transport } = over(() =>
      json(200, { revealed: { ...ACCOUNT, from: "config" } }),
    );

    expect(await accounts.remove("webdav", "nextcloud")).toMatchObject({
      revealed: { from: "config" },
    });
    expect(last(transport).method).toBe("DELETE");
  });

  it("refuse a client carrying a token rather than a session", async () => {
    const { accounts } = over(() => refusal(403, "session-required"));

    await expect(accounts.list()).rejects.toBeInstanceOf(Refused);
  });
});
