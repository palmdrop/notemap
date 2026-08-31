import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import Session from "./Session.svelte";
import SignIn from "./SignIn.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

const said = (
  authenticated: boolean,
  requiresCredentials = true,
  identity?: Record<string, unknown>,
) =>
  json(200, {
    authenticated,
    requiresCredentials,
    ...(identity === undefined ? {} : { identity }),
  });

test("signing in sends the credential and says nothing back about it", async () => {
  const transport = pool((request) =>
    routeOf(request) === "POST /v1/session"
      ? said(true, true, { kind: "session", id: "abc" })
      : json(200, {}),
  );

  render(SignIn);

  await fireEvent.input(screen.getByLabelText("password", { exact: false }), {
    target: { value: "correct horse battery staple" },
  });
  await fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

  await waitFor(() => {
    expect(asked()).toContain("POST /v1/session");
  });

  const sent = transport.sent.find(
    (request) => routeOf(request) === "POST /v1/session",
  );
  expect(await sent?.clone().json()).toMatchObject({
    password: "correct horse battery staple",
  });

  // The field is cleared: a password left in the DOM outlives the sign-in.
  expect(
    (screen.getByLabelText("password", { exact: false }) as HTMLInputElement)
      .value,
  ).toBe("");
});

test("a refused sign-in is said where the person is looking, and stays signable", async () => {
  pool((request) =>
    routeOf(request) === "POST /v1/session"
      ? json(401, { error: { code: "unauthenticated" } })
      : json(200, {}),
  );

  render(SignIn);

  await fireEvent.input(screen.getByLabelText("password", { exact: false }), {
    target: { value: "not the password" },
  });
  await fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

  const alarm = await screen.findByRole("alert");
  expect(alarm.textContent).toMatch(/signed out|sign in/i);
  expect(
    (screen.getByRole("button", { name: /sign in/i }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

test("nothing can be sent until a password is typed", () => {
  pool(() => json(200, {}));

  render(SignIn);

  expect(
    (screen.getByRole("button", { name: /sign in/i }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

test("settings offers signing out where there is a session to end", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/session"
      ? said(true, true, { kind: "session", id: "abc" })
      : json(200, {}),
  );

  render(Session);

  expect(await screen.findByRole("button", { name: /sign out/i })).toBeDefined();
});

/** There is no door to come back out of, so offering the way out would be a lie. */
test("settings offers no way out of a daemon that asks for nothing", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/session" ? said(false, false) : json(200, {}),
  );

  render(Session);

  expect(await screen.findByText(/no password is set/i)).toBeDefined();
  expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();
});

test("signing out tells the daemon", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/session") {
      return said(true, true, { kind: "session", id: "abc" });
    }
    if (route === "DELETE /v1/session") return new Response(null, { status: 204 });
    return json(200, {});
  });

  render(Session);

  await fireEvent.click(await screen.findByRole("button", { name: /sign out/i }));

  await waitFor(() => {
    expect(asked()).toContain("DELETE /v1/session");
  });
});
