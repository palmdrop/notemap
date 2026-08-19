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

test("an available action is taken once", async () => {
  const taken = vi.fn();
  render(ActionFixture, { label: "capture", primary: true, onclick: taken });

  await fireEvent.click(screen.getByRole("button", { name: "capture" }));

  expect(taken).toHaveBeenCalledTimes(1);
});

test("the order selector reports which end the reader wants to start from", async () => {
  const chose = vi.fn();
  render(OrderSelector, { order: "oldest-first", onchoose: chose });

  const control = screen.getByLabelText("Order") as HTMLSelectElement;
  expect(control.value).toBe("oldest-first");

  await fireEvent.change(control, { target: { value: "newest-first" } });
  expect(chose).toHaveBeenCalledWith("newest-first");
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
