import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { asked, pool } from "../../testing/pool";
import { online } from "../../testing/dom";
import Queue from "./Queue.svelte";

vi.mock("$lib/client", () => import("../../testing/pool"));

function queued(...ids: string[]) {
  return (request: Request) =>
    routeOf(request) === "GET /v1/queue"
      ? json(200, { values: ids.map((id) => anItem(id)) })
      : json(404, { error: { code: "no-such-route" } });
}

/** Where the person had scrolled, as the browser would report it. */
function scrolledTo(at: number) {
  Object.defineProperty(window, "scrollY", { configurable: true, value: at });
  return fireEvent.scroll(window);
}

test("puts the view back where the person left it, without asking the pool", async () => {
  pool(queued("one"));

  render(Queue);
  await screen.findByText("one");
  await scrolledTo(240);

  cleanup();
  render(Queue);

  await vi.waitFor(() => {
    expect(window.scrollTo).toHaveBeenCalledWith({ top: 240 });
  });
  expect(asked()).toEqual(["GET /v1/queue"]);
});

test("archives with the pool unreachable, and disables what it cannot queue", async () => {
  const transport = pool(queued("one"));
  online(false);

  render(Queue);
  await screen.findByText("one");
  transport.unreachable(true);

  const disabled = (name: string) =>
    (screen.getByRole("button", { name }) as HTMLButtonElement).disabled;

  expect(disabled("Mark done")).toBe(true);
  expect(disabled("Route…")).toBe(true);
  expect(disabled("Archive")).toBe(false);
  expect(
    screen.getByText("routing needs the daemon; triage does not"),
  ).toBeDefined();

  await fireEvent.click(screen.getByRole("button", { name: "Archive" }));

  // The pool never answered it, and the item left the queue all the same.
  await screen.findByText("Nothing to process.");
  expect(asked()).toContain("POST /v1/items/one/archive");
});
