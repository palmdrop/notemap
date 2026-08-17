import { render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import { pool } from "../../testing/pool";
import Feed from "./Feed.svelte";

vi.mock("$lib/client", () => import("../../testing/pool"));

test("draws what the pool holds", async () => {
  pool((request) =>
    routeOf(request) === "GET /v1/feed"
      ? json(200, { values: [anItem("one"), anItem("two")] })
      : json(404, { error: { code: "no-such-route" } }),
  );

  render(Feed);

  expect(await screen.findByText("one")).toBeDefined();
  expect(await screen.findByText("two")).toBeDefined();
});
