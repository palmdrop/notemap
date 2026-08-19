import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import Refusal from "./Refusal.svelte";

test("a refusal says what was refused and why, and offers the only way out", async () => {
  const dismissed = vi.fn();
  render(Refusal, {
    what: 'tag "research" on 08-14 09:31',
    why: "no such item: it was purged",
    ondismiss: dismissed,
  });

  const said = screen.getByRole("alert");
  expect(said.textContent).toContain('tag "research" on 08-14 09:31');
  expect(said.textContent).toContain("no such item: it was purged");

  await fireEvent.click(screen.getByRole("button", { name: "dismiss" }));
  expect(dismissed).toHaveBeenCalledTimes(1);
});
