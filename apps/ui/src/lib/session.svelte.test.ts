import { createRawSnippet } from "svelte";
import { render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { viewport } from "$testing/dom";
import { pool } from "$testing/pool";
import Layout from "../routes/+layout.svelte";

vi.mock("$app/paths", () => ({
  resolve: (path: string) => path,
}));

vi.mock("$app/state", () => ({
  page: { url: new URL("http://localhost/"), route: { id: "/" }, params: {} },
  updated: { current: false, check: () => Promise.resolve(false) },
  navigating: { to: null },
}));

const children = createRawSnippet(() => ({
  render: () => `<p>the surface</p>`,
}));

/** The shell as a cold start draws it, on a client nothing has asked yet. */
function start() {
  render(Layout, { children });
}

const unreachable = () => {
  throw new TypeError("Failed to fetch");
};

afterEach(() => localStorage.clear());

test("keeps the pool's answer about who this is on the device", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/session"
      ? json(200, { authenticated: true, requiresCredentials: true })
      : json(200, { values: [] }),
  );

  start();

  await waitFor(() => {
    expect(
      JSON.parse(localStorage.getItem("notemap:session") ?? "null"),
    ).toEqual({ required: true, signedIn: true });
  });
});

test("started with no pool to ask, draws what the device holds from the answer kept", async () => {
  localStorage.setItem(
    "notemap:session",
    JSON.stringify({ required: true, signedIn: true }),
  );
  pool(unreachable);

  start();

  expect(await screen.findByText("the surface")).toBeDefined();
  expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
});

test("started with no pool to ask and nothing kept, draws the surface at once and no login", () => {
  pool(unreachable);

  start();

  expect(screen.getByText("the surface")).toBeDefined();
  expect(screen.queryByRole("button", { name: /sign in/i })).toBeNull();
});

test("started with a pool that does not answer and nothing kept, draws the surface at once", () => {
  pool(() => new Promise<Response>(() => undefined));

  start();

  expect(screen.getByText("the surface")).toBeDefined();
});

test("names nobody until it is known who this is", async () => {
  viewport(1280);
  pool(() => new Promise<Response>(() => undefined));

  start();

  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByText(/no password set|signed (in|out)/)).toBeNull();
});

test("a kept answer that was signed out draws the login, not the surface", async () => {
  localStorage.setItem(
    "notemap:session",
    JSON.stringify({ required: true, signedIn: false }),
  );
  pool(unreachable);

  start();

  expect(await screen.findByRole("button", { name: /sign in/i })).toBeDefined();
  expect(screen.queryByText("the surface")).toBeNull();
});

test("started with a pool that does not answer, draws at once from the answer kept", async () => {
  localStorage.setItem(
    "notemap:session",
    JSON.stringify({ required: true, signedIn: true }),
  );
  pool(() => new Promise<Response>(() => undefined));

  start();

  expect(await screen.findByText("the surface")).toBeDefined();
});

test("the pool's answer, when it comes, replaces the one kept", async () => {
  localStorage.setItem(
    "notemap:session",
    JSON.stringify({ required: true, signedIn: true }),
  );
  pool((request) =>
    routeOf(request) === "GET /v1/session"
      ? json(200, { authenticated: false, requiresCredentials: true })
      : json(200, { values: [] }),
  );

  start();

  expect(await screen.findByRole("button", { name: /sign in/i })).toBeDefined();
  expect(screen.queryByText("the surface")).toBeNull();
});
