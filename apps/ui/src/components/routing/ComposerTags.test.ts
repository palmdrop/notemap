import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { asked, client, pool } from "$testing/pool";
import ComposerTags from "./ComposerTags.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

/** The layout is what fills `inUse` in the running shell, so a test does it too. */
async function serving(inUse: readonly string[]) {
  const transport = pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/tags") {
      return json(200, { values: inUse.map((name) => ({ name, items: 1 })) });
    }
    return json(200, {});
  });

  await client.tags.load();
  return transport;
}

function draw(names: readonly string[] = []) {
  render(ComposerTags, { props: { item: "one", names } });
}

const word = (name: string) => screen.getByRole("button", { name });

test("offers the pool's tags in use as words beside what is applied", async () => {
  await serving(["reading", "seedling"]);
  draw(["seedling"]);

  await vi.waitFor(() => expect(word("reading")).toBeDefined());

  expect(word("seedling").getAttribute("aria-pressed")).toBe("true");
  expect(word("reading").getAttribute("aria-pressed")).toBe("false");
});

test("a tag taken here reaches the pool", async () => {
  await serving(["reading"]);
  draw();

  await vi.waitFor(() => expect(word("reading")).toBeDefined());
  await fireEvent.click(word("reading"));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
  expect(word("reading").getAttribute("aria-pressed")).toBe("true");
});

test("a tag taken back is removed", async () => {
  await serving(["reading"]);
  draw(["reading"]);

  await vi.waitFor(() => expect(word("reading")).toBeDefined());
  await fireEvent.click(word("reading"));

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/untag");
  });
});

test("takes a tag the pool has never seen", async () => {
  await serving([]);
  draw();

  await fireEvent.click(screen.getByLabelText("Add a tag"));
  const input = screen.getByLabelText("Add a tag") as HTMLInputElement;
  await fireEvent.input(input, { target: { value: "brand-new" } });
  await fireEvent.blur(input);

  await vi.waitFor(() => {
    expect(asked()).toContain("POST /v1/items/one/tag");
  });
});
