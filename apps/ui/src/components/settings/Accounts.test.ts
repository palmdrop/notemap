import { fireEvent, render, screen } from "@testing-library/svelte";
import { beforeEach, expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, pool, sent } from "$testing/pool";
import Accounts from "./Accounts.svelte";
import { address } from "$testing/address.svelte";
import { follow } from "$testing/router";

vi.mock("$app/state", () => import("$testing/address.svelte"));
vi.mock("$app/navigation", () => import("$testing/router"));

follow();
beforeEach(() => {
  address.path = "/settings/accounts";
});

const KINDS = [
  {
    name: "webdav",
    accountSchema: {
      type: "object",
      required: ["baseUrl", "username"],
      properties: {
        baseUrl: {
          type: "string",
          "x-notemap-placeholder": "https://dav.example.com/files/me",
        },
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

/** An account's form, and a new one's, each open on a page of its own. */
const go = async (name: string | RegExp) =>
  fireEvent.click(await screen.findByRole("link", { name }));

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

  // The fields lead, and what is true of them follows.
  await screen.findByText(
    `${FIELDS.baseUrl}, alice, secret set, stored 2026-09-23`,
  );
  expect(
    screen.getByText(
      `${FIELDS.baseUrl}, alice, no secret, config — ignored, a stored one replaces it`,
    ),
  ).toBeDefined();
  // An account with no fields leads with its secret.
  expect(screen.getByText("secret set, config")).toBeDefined();
  // A shadowed one cannot be opened; the others open their forms.
  await vi.waitFor(() =>
    expect(
      screen.getAllByRole("link", { name: /nextcloud|mine/ }),
    ).toHaveLength(2),
  );
});

test("creates one from its kind's schema, the secret sent once and never shown", async () => {
  serving([]);

  render(Accounts);
  await go("Add an account");

  await fireEvent.input(await screen.findByLabelText("name"), {
    target: { value: "nextcloud" },
  });
  const baseUrl = screen.getByLabelText("baseUrl");
  expect(baseUrl.getAttribute("placeholder")).toBe(
    "https://dav.example.com/files/me",
  );
  await fireEvent.input(baseUrl, { target: { value: FIELDS.baseUrl } });
  await fireEvent.input(screen.getByLabelText("username"), {
    target: { value: FIELDS.username },
  });
  const secret = screen.getByLabelText("secret") as HTMLInputElement;
  expect(secret.type).toBe("password");
  await fireEvent.input(secret, { target: { value: "app-password" } });
  await press("Save");

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
  await go("nextcloud");

  const secret = (await screen.findByLabelText("secret")) as HTMLInputElement;
  expect(secret.value).toBe("");
  expect(secret.required).toBe(false);
  await fireEvent.input(screen.getByLabelText("username"), {
    target: { value: "bob" },
  });
  await press("Save");

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
  await go("nextcloud");

  expect(
    ((await screen.findByLabelText("username")) as HTMLInputElement).value,
  ).toBe("alice");
  expect((screen.getByLabelText("secret") as HTMLInputElement).required).toBe(
    true,
  );
});

test("removes a stored one, and names a refusal", async () => {
  serving([anAccount()], {
    "DELETE /v1/accounts/webdav/nextcloud": () =>
      json(409, { error: { code: "account-in-use", destinations: 2 } }),
  });

  render(Accounts);
  await go("nextcloud");
  await press(/^Remove…/);
  await press("Remove");

  expect(
    await screen.findByText(/2 destination\(s\) still use that account/),
  ).toBeDefined();
});
