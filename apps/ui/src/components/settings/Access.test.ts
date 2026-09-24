import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import Access from "./Access.svelte";

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

const HELD = {
  id: "gpeukvybsmmgwnec",
  name: "the phone in my pocket",
  createdAt: "2026-08-30T09:00:00.000Z",
};

const settled = (name: RegExp) =>
  waitFor(() => {
    const button = screen.getByRole("button", { name }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    return button;
  });

const holding = (
  tokens: readonly Record<string, unknown>[],
  answering?: (request: Request) => Response | undefined,
) =>
  pool((request) => {
    const route = routeOf(request);
    const own = answering?.(request);
    if (own !== undefined) return own;

    if (route === "GET /v1/session") {
      return said(true, true, { kind: "session", id: "abc" });
    }
    if (route === "GET /v1/tokens") return json(200, { values: tokens });
    return json(200, {});
  });

test("offers signing out where there is a session to end", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/session"
      ? said(true, true, { kind: "session", id: "abc" })
      : json(200, {}),
  );

  render(Access);

  expect(
    await screen.findByRole("button", { name: /sign out/i }),
  ).toBeDefined();
});

/** There is no door to come back out of, so offering the way out would be a lie. */
test("offers no way out of a daemon that asks for nothing", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/session" ? said(false, false) : json(200, {}),
  );

  render(Access);

  expect(await screen.findByText(/no password is set/i)).toBeDefined();
  expect(screen.queryByRole("button", { name: /sign out/i })).toBeNull();
});

test("signing out tells the daemon", async () => {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/session") {
      return said(true, true, { kind: "session", id: "abc" });
    }
    if (route === "DELETE /v1/session")
      return new Response(null, { status: 204 });
    return json(200, {});
  });

  render(Access);

  await fireEvent.click(
    await screen.findByRole("button", { name: /sign out/i }),
  );

  await waitFor(() => {
    expect(asked()).toContain("DELETE /v1/session");
  });
});

test("a token-carrying shell is not offered the tokens at all", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/session"
      ? json(200, {
          authenticated: true,
          requiresCredentials: true,
          identity: { kind: "token", id: "abc", name: "a script" },
        })
      : json(200, {}),
  );

  render(Access);

  // The routes are a session's alone, so asking would only be refused.
  await waitFor(() => {
    expect(asked()).toContain("GET /v1/session");
  });
  expect(screen.queryByText(/access tokens/i)).toBeNull();
  expect(asked()).not.toContain("GET /v1/tokens");
});

test("what exists is listed, with no secret among it", async () => {
  holding([HELD]);

  render(Access);

  await waitFor(() => {
    expect(screen.getByText(HELD.name)).toBeTruthy();
  });
  expect(screen.getByText(/never used/i)).toBeTruthy();
});

test("a minted token is shown once, and not again", async () => {
  let listed: Record<string, unknown>[] = [];

  holding([], (request) => {
    if (routeOf(request) !== "POST /v1/tokens") return undefined;

    listed = [HELD];
    return json(201, { ...HELD, token: "nmp.gpeukvybsmmgwnec.qK9v" });
  });

  render(Access);

  await fireEvent.click(await settled(/\+ add a token/));
  await fireEvent.input(screen.getByLabelText("name"), {
    target: { value: HELD.name },
  });
  await fireEvent.click(await settled(/create/i));

  await waitFor(() => {
    expect(screen.getByText("nmp.gpeukvybsmmgwnec.qK9v")).toBeTruthy();
  });
  expect(listed).toHaveLength(1);

  // Dismissed, the string is gone from the page: nothing re-reads it, because
  // the daemon kept a hash and has nothing to answer with.
  await fireEvent.click(screen.getByRole("button", { name: /done/i }));
  expect(screen.queryByText("nmp.gpeukvybsmmgwnec.qK9v")).toBeNull();
});

test("revoking one takes it off the list", async () => {
  let held = [HELD];

  holding([], (request) => {
    const route = routeOf(request);

    if (route === "GET /v1/tokens") return json(200, { values: held });
    if (route === `DELETE /v1/tokens/${HELD.id}`) {
      held = [];
      return new Response(null, { status: 204 });
    }

    return undefined;
  });

  render(Access);
  await waitFor(() => {
    expect(screen.getByText(HELD.name)).toBeTruthy();
  });

  await fireEvent.click(await settled(/revoke/i));

  await waitFor(() => {
    expect(screen.queryByText(HELD.name)).toBeNull();
  });
});

test("a refusal is said where the person is looking", async () => {
  holding([], (request) =>
    routeOf(request) === "GET /v1/tokens"
      ? json(403, { error: { code: "session-required" } })
      : undefined,
  );

  render(Access);

  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBeTruthy();
  });
});
