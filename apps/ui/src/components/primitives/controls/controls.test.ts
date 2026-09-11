import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import Action from "./Action.svelte";
import OrderSelector from "./OrderSelector.svelte";
import TagSet from "./TagSet.svelte";
import ActionFixture from "./Action.fixture.svelte";

test("an unavailable action reads as unavailable rather than as broken", () => {
  render(ActionFixture, { label: "route", disabled: true, onclick: vi.fn() });

  const action = screen.getByRole("button", { name: "route" });
  expect((action as HTMLButtonElement).disabled).toBe(true);
});

test("somewhere to go is a link, so the browser's own gestures come with it", () => {
  render(ActionFixture, {
    label: "open",
    href: "/items/one",
    onclick: vi.fn(),
  });

  expect(screen.getByRole("link", { name: "open" }).getAttribute("href")).toBe(
    "/items/one",
  );
});

test("somewhere that cannot be gone to is not a link at all", () => {
  render(ActionFixture, {
    label: "open",
    href: "/items/one",
    disabled: true,
    onclick: vi.fn(),
  });

  // A disabled anchor still navigates, so there is no anchor to disable.
  expect(screen.queryByRole("link")).toBeNull();
  expect(screen.getByText("open").getAttribute("aria-disabled")).toBe("true");
});

test("an available action is taken once", async () => {
  const taken = vi.fn();
  render(ActionFixture, { label: "capture", primary: true, onclick: taken });

  await fireEvent.click(screen.getByRole("button", { name: "capture" }));

  expect(taken).toHaveBeenCalledTimes(1);
});

/** A word, a mark, and a panel of marked options: the shell draws its own. */
test("the order selector reports which end the reader wants to start from", async () => {
  const chose = vi.fn();
  render(OrderSelector, { order: "oldest-first", onchoose: chose });

  const control = screen.getByLabelText("Order");
  expect(control.textContent).toContain("oldest");
  expect(control.getAttribute("aria-expanded")).toBe("false");
  expect(document.querySelector("select")).toBeNull();

  await fireEvent.click(control);
  await fireEvent.click(screen.getByRole("button", { name: "newest" }));

  expect(chose).toHaveBeenCalledWith("newest-first");
  expect(control.getAttribute("aria-expanded")).toBe("false");
});

test("marks the end it is already reading from, and offers the other", async () => {
  render(OrderSelector, { order: "newest-first", onchoose: vi.fn() });

  await fireEvent.click(screen.getByLabelText("Order"));

  const marked = screen
    .getAllByRole("button")
    .filter((one) => one.getAttribute("aria-pressed") === "true");
  // The mark is the pointer `where` already uses.
  expect(marked.map((one) => one.textContent?.trim())).toEqual(["▸ newest"]);
});

test("shuts on escape without choosing anything", async () => {
  const chose = vi.fn();
  render(OrderSelector, { order: "oldest-first", onchoose: chose });

  const control = screen.getByLabelText("Order");
  await fireEvent.click(control);
  await fireEvent.keyDown(control, { key: "Escape" });

  expect(control.getAttribute("aria-expanded")).toBe("false");
  expect(chose).not.toHaveBeenCalled();
});

/**
 * The panel is shut by leaving the control, so a pointer that moved the caret
 * into it would shut it on the way to the option being taken. Safari is where
 * that bites: it gives a clicked button no focus, and the trigger's own would
 * have gone. The place line prevents the same default for the same reason.
 */
test("takes no focus when it is pointed at, so choosing survives the pointer", async () => {
  render(OrderSelector, { order: "oldest-first", onchoose: vi.fn() });

  await fireEvent.click(screen.getByLabelText("Order"));

  const down = fireEvent.mouseDown(
    screen.getByRole("button", { name: "oldest" }),
  );
  // `fireEvent` answers false where the default was prevented.
  expect(await down).toBe(false);
});

/** A panel of buttons is what it is, and `listbox` would promise options. */
test("draws its panel as a named group rather than a listbox", async () => {
  render(OrderSelector, { order: "oldest-first", onchoose: vi.fn() });

  const control = screen.getByLabelText("Order");
  await fireEvent.click(control);

  expect(screen.queryByRole("listbox")).toBeNull();
  const panel = screen.getByRole("group", { name: "Order" });
  expect(control.getAttribute("aria-controls")).toBe(panel.id);
});

test("a tag is added by name, trimmed, and an empty one is not added at all", async () => {
  const added = vi.fn();
  render(TagSet, { names: [], onadd: added, onremove: vi.fn() });

  const open = async () =>
    fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));

  await open();
  const field = screen.getByLabelText("Add a tag");
  await fireEvent.input(field, { target: { value: "  design  " } });
  await fireEvent.submit(field.closest("form") as HTMLFormElement);
  expect(added).toHaveBeenCalledWith("design");

  await open();
  await fireEvent.submit(
    screen.getByLabelText("Add a tag").closest("form") as HTMLFormElement,
  );
  expect(added).toHaveBeenCalledTimes(1);
});

test("offers what is in use as words beside what the item carries", async () => {
  const added = vi.fn();
  render(TagSet, {
    names: ["kind/quote"],
    offered: ["kind/quote", "project/fiction-a"],
    onadd: added,
    onremove: vi.fn(),
  });

  const carried = screen.getByRole("button", { name: "kind/quote" });
  const offered = screen.getByRole("button", { name: "project/fiction-a" });
  expect(carried.getAttribute("aria-pressed")).toBe("true");
  expect(offered.getAttribute("aria-pressed")).toBe("false");

  await fireEvent.click(offered);
  expect(added).toHaveBeenCalledWith("project/fiction-a");
});

test("folded, the offer is drawn only while a name is being added, narrowed as it is typed", async () => {
  render(TagSet, {
    names: ["seedling"],
    offered: ["reading", "recipe", "seedling"],
    folded: true,
    onadd: vi.fn(),
    onremove: vi.fn(),
  });

  expect(screen.queryByRole("button", { name: "reading" })).toBeNull();

  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  expect(screen.getByRole("button", { name: "reading" })).toBeDefined();

  await fireEvent.input(screen.getByLabelText("Add a tag"), {
    target: { value: "re" },
  });
  expect(screen.getByRole("button", { name: "recipe" })).toBeDefined();
  expect(screen.queryByRole("button", { name: "seedling" })).not.toBeNull();
  expect(
    screen
      .getByRole("button", { name: "seedling" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

test("a tag the item carries is removed by pressing its word", async () => {
  const removed = vi.fn();
  render(TagSet, {
    names: ["design", "notemap"],
    onadd: vi.fn(),
    onremove: removed,
  });

  await fireEvent.click(screen.getByRole("button", { name: "notemap" }));
  expect(removed).toHaveBeenCalledWith("notemap");
});

test("a trigger tag is marked with the template it applies", () => {
  render(TagSet, {
    names: [],
    offered: ["route/research"],
    fires: (name) => (name === "route/research" ? "research" : undefined),
    onadd: vi.fn(),
    onremove: vi.fn(),
  });

  expect(
    screen.getByRole("button", { name: "route/research, routes to research" }),
  ).toBeDefined();
});

/** Referenced so a rename cannot leave the fixture pointing at nothing. */
void Action;
