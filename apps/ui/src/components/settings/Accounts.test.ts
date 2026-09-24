import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, pool, sent } from "$testing/pool";
import Accounts from "./Accounts.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

const KINDS = [
  {
    name: "webdav",
    accountSchema: {
      type: "object",
      required: ["baseUrl", "username"],
      properties: {
        baseUrl: { type: "string" },
        username: { type: "string" },
      },
    },
  },
  { name: "arena", accountSchema: { type: "object", properties: {} } },
];

const FIELDS = {
  baseUrl: "https://cloud.example/remote.php/dav/files/alice",
  username: "alice",
};

function anAccount(overrides: Record<string, unknown> = {}) {
  return {
    kind: "webdav",
    name: "nextcloud",
    fields: FIELDS,
    from: "stored",
    shadowed: false,
    secretSet: true,
    changedAt: "2026-09-23T09:00:00.000Z",
    ...overrides,
  };
}

function serving(
  held: readonly Record<string, unknown>[],
  overrides: Partial<Record<string, () => Response>> = {},
) {
  return pool((request) => {
    const route = routeOf(request);
    const answer = overrides[route];
    if (answer !== undefined) return answer();

    if (route === "GET /v1/account-kinds") return json(200, { values: KINDS });
    if (route === "GET /v1/accounts") return json(200, { values: held });
    if (route.startsWith("PUT /v1/accounts/")) return json(200, anAccount());
    if (route.startsWith("DELETE /v1/accounts/")) return json(200, {});
    return json(404, { error: { code: "unknown-route" } });
  });
}

const press = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("button", { name }));

test("lists accounts by kind, saying where each came from and whether a secret is set", async () => {
  serving([
    anAccount(),
    anAccount({
      from: "config",
      shadowed: true,
      secretSet: false,
      changedAt: undefined,
    }),
    anAccount({
      kind: "arena",
      name: "mine",
      fields: {},
      from: "config",
      changedAt: undefined,
    }),
  ]);

  render(Accounts);

  await screen.findByText(/secret set · stored 2026-09-23/);
  expect(
    screen.getByText(/no secret · config — ignored, a stored one replaces it/),
  ).toBeDefined();
  expect(screen.getByText("secret set · config")).toBeDefined();
  // Only the stored one can be removed here; a shadowed one cannot be edited.
  expect(screen.getAllByRole("button", { name: "remove" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "edit" })).toHaveLength(2);
});

test("creates one from its kind's schema, the secret sent once and never shown", async () => {
  serving([]);

  render(Accounts);
  await press("+ add an account");

  await fireEvent.input(await screen.findByLabelText("Name"), {
    target: { value: "nextcloud" },
  });
  await fireEvent.input(screen.getByLabelText("baseUrl"), {
    target: { value: FIELDS.baseUrl },
  });
  await fireEvent.input(screen.getByLabelText("username"), {
    target: { value: FIELDS.username },
  });
  const secret = screen.getByLabelText("Secret") as HTMLInputElement;
  expect(secret.type).toBe("password");
  await fireEvent.input(secret, { target: { value: "app-password" } });
  await press("create");

  await vi.waitFor(() =>
    expect(asked()).toContain("PUT /v1/accounts/webdav/nextcloud"),
  );
  expect(await sent()).toContainEqual({
    fields: FIELDS,
    secret: "app-password",
  });
});

test("leaves the held secret alone when an edit leaves the field blank", async () => {
  serving([anAccount()]);

  render(Accounts);
  await press("edit");

  const secret = (await screen.findByLabelText("Secret")) as HTMLInputElement;
  expect(secret.value).toBe("");
  expect(secret.required).toBe(false);
  await fireEvent.input(screen.getByLabelText("username"), {
    target: { value: "bob" },
  });
  await press("save");

  await vi.waitFor(() =>
    expect(asked()).toContain("PUT /v1/accounts/webdav/nextcloud"),
  );
  expect(await sent()).toContainEqual({
    fields: { ...FIELDS, username: "bob" },
  });
});

test("edits a config account by storing a copy, which needs a secret of its own", async () => {
  serving([anAccount({ from: "config", changedAt: undefined })]);

  render(Accounts);
  await press("edit");

  expect(
    ((await screen.findByLabelText("username")) as HTMLInputElement).value,
  ).toBe("alice");
  expect((screen.getByLabelText("Secret") as HTMLInputElement).required).toBe(
    true,
  );
});

test("removes a stored one, and names a refusal", async () => {
  serving([anAccount()], {
    "DELETE /v1/accounts/webdav/nextcloud": () =>
      json(409, { error: { code: "account-in-use", destinations: 2 } }),
  });

  render(Accounts);
  await press("remove");

  expect(
    await screen.findByText(/2 destination\(s\) still use that account/),
  ).toBeDefined();
});
