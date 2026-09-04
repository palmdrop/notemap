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

test("the field completes from what is in use, minus what the item carries", async () => {
  render(TagSet, {
    names: ["kind/quote"],
    offered: ["kind/quote", "project/fiction-a"],
    onadd: vi.fn(),
    onremove: vi.fn(),
  });

  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));

  const field = screen.getByLabelText("Add a tag") as HTMLInputElement;
  const list = document.getElementById(field.getAttribute("list") ?? "");
  expect(
    [...(list?.children ?? [])].map((one) => one.getAttribute("value")),
  ).toEqual(["project/fiction-a"]);
});

test("a tag is removed by name", async () => {
  const removed = vi.fn();
  render(TagSet, {
    names: ["design", "notemap"],
    onadd: vi.fn(),
    onremove: removed,
  });

  await fireEvent.click(screen.getByRole("button", { name: "Remove notemap" }));
  expect(removed).toHaveBeenCalledWith("notemap");
});

/** Referenced so a rename cannot leave the fixture pointing at nothing. */
void Action;
