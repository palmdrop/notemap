import { render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { MAX_BATCH } from "@notemap/client";
import { anItem } from "@notemap/client/testing";

import Marked from "./Marked.svelte";

const handlers = { onbatch: vi.fn(), onall: vi.fn(), onclear: vi.fn() };

test("says so once as many are marked as one batch takes", () => {
  render(Marked, { marked: [anItem("one")], full: true, ...handlers });

  expect(screen.getByRole("status").textContent).toContain(String(MAX_BATCH));
});

test("says nothing of the limit below it", () => {
  render(Marked, { marked: [anItem("one")], ...handlers });

  expect(screen.queryByRole("status")).toBeNull();
});
