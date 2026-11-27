import { createRawSnippet } from "svelte";
import { render, screen } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { pool } from "$testing/pool";
import Layout from "./+layout.svelte";

const at = vi.hoisted(() => ({ route: "/capture" }));

vi.mock("$app/paths", () => ({ resolve: (path: string) => path }));
vi.mock("$app/state", () => ({
  get page() {
    return {
      url: new URL(`http://localhost${at.route}`),
      route: { id: at.route },
      params: {},
    };
  },
  updated: { current: false, check: () => Promise.resolve(false) },
  navigating: { to: null },
}));

const children = createRawSnippet(() => ({
  render: () => `<p>the page</p>`,
}));

/** Opened from the home screen rather than in a tab. */
function installed(yes: boolean): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: yes && query === "(display-mode: standalone)",
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

function signedOut(): void {
  pool((request) =>
    routeOf(request) === "GET /v1/session"
      ? json(200, { authenticated: false, requiresCredentials: true })
      : json(401, { error: { code: "unauthenticated" } }),
  );
}

/** Once the pool has said nobody is signed in, as the device keeps it. */
async function answered(): Promise<void> {
  await vi.waitFor(() => {
    expect(localStorage.getItem("notemap:session")).toBe(
      JSON.stringify({ required: true, signedIn: false }),
    );
  });
}

afterEach(() => {
  localStorage.clear();
  at.route = "/capture";
  vi.unstubAllGlobals();
});

test("installed and signed out, the capture page is drawn rather than the sign-in", async () => {
  installed(true);
  signedOut();

  render(Layout, { children });
  await answered();

  expect(screen.getByText("the page")).toBeDefined();
  expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
});

test("installed and signed out, every other page is the sign-in", async () => {
  installed(true);
  signedOut();
  at.route = "/";

  render(Layout, { children });

  expect(await screen.findByRole("button", { name: /sign in/i })).toBeDefined();
  expect(screen.queryByText("the page")).toBeNull();
});

test("in a tab and signed out, the capture page is the sign-in too", async () => {
  installed(false);
  signedOut();

  render(Layout, { children });

  expect(await screen.findByRole("button", { name: /sign in/i })).toBeDefined();
  expect(screen.queryByText("the page")).toBeNull();
});
