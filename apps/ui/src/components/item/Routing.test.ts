import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { pool } from "$testing/pool";
import Routing from "./Routing.svelte";

const PENDING = {
  id: "rec",
  item: "held",
  target: {
    kind: "destination",
    destination: "vault",
    capability: "create",
    arguments: { directory: "projects/research/2026" },
  },
  state: "pending",
  at: "2026-08-19T22:14:00.000Z",
} as const;

/**
 * jsdom lays nothing out, so this pins the shape rather than its effect: the
 * destination is one unit and the place with its mark another, so a narrow
 * rail breaks the line between them and nowhere else.
 */
test("keeps a record to two lines, the mark at the end of the place", async () => {
  pool((request) => {
    if (routeOf(request).endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [
          {
            name: "create",
            accepts: ["text"],
            argumentsSchema: {
              type: "object",
              properties: { directory: { type: "string" } },
            },
          },
        ],
      });
    }
    return json(200, { values: [] });
  });

  render(Routing, { summary: undefined, records: [PENDING] });

  const place = await screen.findByText("…/2026");
  const mark = screen.getByRole("img", { name: "pending" });
  const line = screen.getByRole("link");

  expect(line.className).toContain("flex-wrap");
  expect(line.children).toHaveLength(2);
  const [destination, rest] = [...line.children];
  expect(destination?.textContent).toContain("a destination");
  expect(destination?.contains(mark)).toBe(false);
  expect(rest?.contains(place)).toBe(true);
  expect(rest?.contains(mark)).toBe(true);
  expect(line.title).toBe("a destination projects/research/2026");
});

test("reads a pending create as a path, and as its folder until it has a filename", async () => {
  pool((request) => {
    if (routeOf(request).endsWith("/description")) {
      return json(200, {
        kind: "described",
        capabilities: [
          {
            name: "create",
            accepts: ["text"],
            argumentsSchema: {
              type: "object",
              properties: {
                directory: { type: "string", "x-notemap-path": "folders" },
                filename: { type: "string", "x-notemap-path": "leaf" },
              },
            },
          },
        ],
      });
    }
    return json(200, { values: [] });
  });

  const named = {
    ...PENDING,
    id: "named",
    target: {
      ...PENDING.target,
      arguments: {
        directory: "projects/research/2026",
        filename: "a-rather-long-filename-for-the-day.md",
      },
    },
  };
  render(Routing, { summary: undefined, records: [named, PENDING] });

  expect(
    await screen.findByText("…/a-rather-long-filename-for-the-day.md"),
  ).toBeDefined();
  expect(screen.getByText("…/2026/")).toBeDefined();
});
