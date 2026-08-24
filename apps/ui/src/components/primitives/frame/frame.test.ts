import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import Furl from "./Furl.svelte";
import Nav from "./Nav.svelte";
import Reachability from "./Reachability.svelte";
import Waiting from "./Waiting.svelte";

const SURFACES = [
  { href: "/", label: "queue" },
  { href: "/feed", label: "feed" },
];

test("marks the surface being read, and only that one", () => {
  render(Nav, { surfaces: SURFACES, current: "/feed" });

  const marked = (name: string) =>
    screen.getByRole("link", { name }).getAttribute("aria-current");

  expect(marked("feed")).toBe("page");
  expect(marked("queue")).toBeNull();
});

test("says whether the pool is within reach", () => {
  const { rerender } = render(Reachability, { yes: true });
  expect(screen.getByRole("status").textContent?.trim()).toBe("online");

  void rerender({ yes: false });
  expect(screen.getByRole("status").textContent?.trim()).toBe("offline");
});

test("says which way furling the rail will go", async () => {
  const furl = vi.fn();
  const { rerender } = render(Furl, { furled: false, ontoggle: furl });

  await fireEvent.click(screen.getByRole("button", { name: "hide metadata" }));
  expect(furl).toHaveBeenCalledTimes(1);

  void rerender({ furled: true, ontoggle: furl });
  expect(screen.getByRole("button", { name: "show metadata" })).toBeDefined();
});

/** Pending is ordinary and heals itself, so an idle outbox says nothing at all. */
test("says how much is waiting, and only while something is", () => {
  const { rerender } = render(Waiting, { count: 0 });
  expect(screen.queryByRole("status")).toBeNull();

  void rerender({ count: 4 });
  expect(screen.getByRole("status").textContent?.trim()).toBe("4 waiting");
});
