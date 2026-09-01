import { fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "$testing/pool";
import Tokens from "./Tokens.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

const SESSION = {
  authenticated: true,
  requiresCredentials: true,
  identity: { kind: "session", id: "abc" },
};

const HELD = {
  id: "gpeukvybsmmgwnec",
  name: "the phone in my pocket",
  createdAt: "2026-08-30T09:00:00.000Z",
};

/**
 * Every control is held while anything is in flight, the first read of the list
 * included — so a test that acts the moment the field appears acts on a form
 * that is not taking anything yet.
 */
const settled = (name: RegExp) =>
  waitFor(() => {
    const button = screen.getByRole("button", { name }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    return button;
  });

const ready = (label: string) => waitFor(() => screen.getByLabelText(label));

/** A daemon a session is through the door of, holding whatever is passed. */
const holding = (
  tokens: readonly Record<string, unknown>[],
  answering?: (request: Request) => Response | undefined,
) =>
  pool((request) => {
    const route = routeOf(request);
    const own = answering?.(request);
    if (own !== undefined) return own;

    if (route === "GET /v1/session") return json(200, SESSION);
    if (route === "GET /v1/tokens") return json(200, { values: tokens });
    return json(200, {});
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

  render(Tokens);

  // The routes are a session's alone, so asking would only be refused.
  await waitFor(() => {
    expect(asked()).toContain("GET /v1/session");
  });
  expect(screen.queryByText(/access tokens/i)).toBeNull();
  expect(asked()).not.toContain("GET /v1/tokens");
});

test("what exists is listed, with no secret among it", async () => {
  holding([HELD]);

  render(Tokens);

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

  render(Tokens);

  await fireEvent.input(await ready("name"), { target: { value: HELD.name } });
  await fireEvent.click(await settled(/mint/i));

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

  render(Tokens);
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

  render(Tokens);

  await waitFor(() => {
    expect(screen.getByRole("status").textContent).toBeTruthy();
  });
});
