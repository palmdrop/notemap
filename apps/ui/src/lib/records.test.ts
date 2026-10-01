import { render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, routeOf } from "@notemap/client/testing";

import { pool } from "$testing/pool";
import Fixture from "./records.fixture.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

const record = (id: string, item: string) => ({
  id,
  item,
  at: "2026-10-01T10:00:00.000Z",
  state: "pending",
  target: {
    kind: "destination",
    destination: "019a3f2c-0e6e-7c31-9f3a-6b1f2d5c4a77",
    capability: "create",
    arguments: {},
  },
});

const drawn = () => screen.getByTestId("records").textContent;

/** Emptied while it asked, a routing line fell back to the summary and its mark flickered. */
test("keeps the records drawn while the same item is read again", async () => {
  let answer: (response: Response) => void = () => undefined;
  let asks = 0;
  pool((request) => {
    if (!routeOf(request).endsWith("/routing")) return json(404, {});
    asks += 1;
    if (asks === 1) return json(200, { values: [record("r1", "one")] });
    return new Promise<Response>((done) => (answer = done));
  });

  const { rerender } = render(Fixture, { id: "one", version: 0 });
  await vi.waitFor(() => expect(drawn()).toBe("r1"));

  await rerender({ id: "one", version: 1 });
  await vi.waitFor(() => expect(asks).toBe(2));
  expect(drawn()).toBe("r1");

  answer(json(200, { values: [record("r2", "one")] }));
  await vi.waitFor(() => expect(drawn()).toBe("r2"));
});

test("empties at once for another item, never drawing one item's records under another", async () => {
  let asks = 0;
  pool((request) => {
    if (!routeOf(request).endsWith("/routing")) return json(404, {});
    asks += 1;
    return asks === 1
      ? json(200, { values: [record("r1", "one")] })
      : new Promise<Response>(() => undefined);
  });

  const { rerender } = render(Fixture, { id: "one", version: 0 });
  await vi.waitFor(() => expect(drawn()).toBe("r1"));

  await rerender({ id: "two", version: 0 });
  expect(drawn()).toBe("");
});

test("draws the latest read of the same item, whichever answers last", async () => {
  const answers: ((response: Response) => void)[] = [];
  pool((request) => {
    if (!routeOf(request).endsWith("/routing")) return json(404, {});
    return new Promise<Response>((done) => answers.push(done));
  });

  const { rerender } = render(Fixture, { id: "one", version: 0 });
  await vi.waitFor(() => expect(answers).toHaveLength(1));
  await rerender({ id: "one", version: 1 });
  await vi.waitFor(() => expect(answers).toHaveLength(2));

  answers[1]?.(json(200, { values: [record("newer", "one")] }));
  await vi.waitFor(() => expect(drawn()).toBe("newer"));
  answers[0]?.(json(200, { values: [record("older", "one")] }));
  await new Promise((done) => setTimeout(done, 20));
  expect(drawn()).toBe("newer");
});
