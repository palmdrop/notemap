import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import SignIn from "./SignIn.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

test("signing in sends the credential and says nothing back about it", async () => {
  const transport = pool((request) =>
    routeOf(request) === "POST /v1/session"
      ? json(200, {
          authenticated: true,
          requiresCredentials: true,
          identity: { kind: "session", id: "abc" },
        })
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
