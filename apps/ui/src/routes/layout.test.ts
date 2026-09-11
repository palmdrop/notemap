import { createRawSnippet } from "svelte";
import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import Layout from "./+layout.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

vi.mock("$app/paths", () => ({
  resolve: (path: string) => path,
}));

vi.mock("$app/state", () => ({
  page: { url: new URL("http://localhost/"), route: { id: "/" } },
}));

const children = createRawSnippet(() => ({
  render: () => `<p>the surface</p>`,
}));

const shut = () =>
  json(200, { authenticated: false, requiresCredentials: true });

test("a shut door draws the login, and typing a password makes it signable", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/session" ? shut() : json(200, {}),
  );

  render(Layout, { children });

  const button = (await screen.findByRole("button", {
    name: /sign in/i,
  })) as HTMLButtonElement;
  expect(button.disabled).toBe(true);
  expect(screen.queryByText("the surface")).toBeNull();

  await fireEvent.input(screen.getByLabelText("password", { exact: false }), {
    target: { value: "correct horse battery staple" },
  });

  expect(button.disabled).toBe(false);
});

test("signing in through the shell reaches the daemon and draws the surface", async () => {
  let signedIn = false;
  pool((request) => {
    const route = routeOf(request);
    if (route === "POST /v1/session") {
      signedIn = true;
      return json(200, {
        authenticated: true,
        requiresCredentials: true,
        identity: { kind: "session", id: "abc" },
      });
    }
    if (route === "GET /v1/session") {
      return signedIn
        ? json(200, {
            authenticated: true,
            requiresCredentials: true,
            identity: { kind: "session", id: "abc" },
          })
        : shut();
    }
    return json(200, { values: [] });
  });

  render(Layout, { children });

  await fireEvent.input(
    await screen.findByLabelText("password", { exact: false }),
    { target: { value: "correct horse battery staple" } },
  );
  await fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

  await waitFor(() => {
    expect(asked()).toContain("POST /v1/session");
  });
  expect(await screen.findByText("the surface")).toBeDefined();
});
