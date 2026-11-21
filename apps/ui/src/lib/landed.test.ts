import { afterEach, expect, test } from "vitest";

import { landedAt, sayLanded } from "./landed";
import { notices } from "./notices.svelte";

afterEach(() => notices.clear());

test("says the end of the queue when the oldest come first, and the top otherwise", () => {
  expect(landedAt("oldest-first")).toBe("Captured, at the end of the queue");
  expect(landedAt("newest-first")).toBe("Captured, at the top of the queue");
});

test("offers Show, which brings the row into view", () => {
  const row = document.createElement("div");
  row.dataset["row"] = "one";
  document.body.append(row);

  sayLanded("one", "oldest-first");
  const said = notices.latest;
  expect(said?.what).toBe("Captured, at the end of the queue");
  expect(said?.offer?.label).toBe("Show");

  notices.take(said!.id);
  expect(row.scrollIntoView).toHaveBeenCalled();
  row.remove();
});
