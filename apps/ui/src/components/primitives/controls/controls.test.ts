import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import Action from "./Action.svelte";
import OrderSelector from "./OrderSelector.svelte";
import TagSet from "./TagSet.svelte";
import ActionFixture from "./Action.fixture.svelte";
import { SHOWN_AFTER } from "../marks/Asking.svelte";

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

test("an action that has asked cannot be taken again, and keeps its label until the mark is due", async () => {
  vi.useFakeTimers();
  try {
    const taken = vi.fn();
    const { rerender } = render(ActionFixture, {
      label: "save",
      working: true,
      onclick: taken,
    });

    const action = screen.getByRole("button", { name: /save/ });
    expect((action as HTMLButtonElement).disabled).toBe(true);
    expect(action.getAttribute("aria-busy")).toBe("true");
    expect(
      action.querySelector("[data-asking]")?.getAttribute("data-asking"),
    ).toBe("hidden");

    await vi.advanceTimersByTimeAsync(SHOWN_AFTER);
    expect(
      action.querySelector("[data-asking]")?.getAttribute("data-asking"),
    ).toBe("shown");
    // Both sit in one cell, so the button is as wide as the wider of them throughout.
    expect(screen.getByText("save").className).toContain("invisible");

    await rerender({ label: "save", working: false, onclick: taken });
    expect(action.querySelector("[data-asking]")).toBeNull();
    expect((action as HTMLButtonElement).disabled).toBe(false);

    await rerender({ label: "save", working: true, onclick: taken });
    expect(screen.getByText("save").className).not.toContain("invisible");
  } finally {
    vi.useRealTimers();
  }
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

function tagSet(
  props: Partial<{
    names: readonly string[];
    offered: readonly string[];
    fires: (name: string) => string | undefined;
    held: (name: string) => boolean;
  }> = {},
) {
  const added = vi.fn();
  const removed = vi.fn();
  render(TagSet, {
    names: [],
    offered: [],
    ...props,
    onadd: added,
    onremove: removed,
  });
  return { added, removed };
}

const opened = async () => {
  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  return screen.getByRole("combobox", { name: "Add a tag" });
};

const typed = (line: HTMLElement, value: string) =>
  fireEvent.input(line, { target: { value } });

const pressed = (line: HTMLElement, key: string) =>
  fireEvent.keyDown(line, { key });

const options = () =>
  screen.queryAllByRole("option").map((one) => one.textContent?.trim());

test("a tag typed is taken on enter, trimmed, and an empty line takes nothing", async () => {
  const { added } = tagSet();

  let line = await opened();
  await typed(line, "  design  ");
  await pressed(line, "Enter");
  expect(added).toHaveBeenCalledWith("design");

  line = await opened();
  await pressed(line, "Enter");
  expect(added).toHaveBeenCalledTimes(1);
});

test("the offer is drawn beneath the line, minus what the item carries, narrowed as it is typed", async () => {
  tagSet({
    names: ["seedling"],
    offered: ["reading", "recipe", "seedling"],
  });

  expect(screen.queryByRole("listbox")).toBeNull();

  const line = await opened();
  expect(options()).toEqual(["reading", "recipe"]);

  await typed(line, "rec");
  // `recipe` matches, and the last row is how a name no offer holds is made —
  // drawn even where something else matched, since nothing offered is `rec`.
  expect(options()).toEqual(["recipe", "new · rec"]);
});

/** A long offer is a sample while the line is empty, and the whole list once typing narrows it. */
test("offers a handful while the line is empty, and the whole narrowed list once typing", async () => {
  const many = Array.from({ length: 12 }, (_, at) => `tag-${String(at)}`);
  tagSet({ offered: many });

  await opened();
  expect(options()).toHaveLength(8);

  await typed(screen.getByRole("combobox"), "tag-1");
  // "tag-1", "tag-10" and "tag-11" all match, and none is held back.
  expect(options()).toHaveLength(3);
});

test("an offered tag is taken by pressing its row, and the line never blurs first", async () => {
  const { added } = tagSet({ offered: ["reading"] });

  await opened();
  const row = screen.getByRole("option", { name: "reading" });
  // `fireEvent` answers whether the default went through, and here it must not.
  expect(await fireEvent.mouseDown(row)).toBe(false);

  expect(added).toHaveBeenCalledWith("reading");
  expect(screen.queryByRole("combobox")).toBeNull();
});

test("tab completes what is typed, then walks what still matches", async () => {
  const { added } = tagSet({ offered: ["reading", "reasoning", "seedling"] });

  const line = (await opened()) as HTMLInputElement;
  await typed(line, "r");

  await pressed(line, "Tab");
  expect(line.value).toBe("rea");
  // The first match is marked as soon as the line holds it, completion or not.
  expect(
    screen
      .getByRole("option", { name: "reading" })
      .getAttribute("aria-selected"),
  ).toBe("true");

  // Nothing left to complete: the very next press walks, no dead press between.
  await pressed(line, "Tab");
  expect(line.value).toBe("rea");
  expect(
    screen
      .getByRole("option", { name: "reasoning" })
      .getAttribute("aria-selected"),
  ).toBe("true");

  await pressed(line, "Enter");
  expect(added).toHaveBeenCalledWith("reasoning");
});

test("nothing is marked while the line is empty, so a reflex enter tags nothing", async () => {
  const { added } = tagSet({ offered: ["reading", "seedling"] });

  const line = await opened();
  expect(screen.queryByRole("option", { selected: true })).toBeNull();
  await pressed(line, "Enter");

  expect(added).not.toHaveBeenCalled();
  expect(screen.queryByRole("combobox")).toBeNull();
});

test("the first arrow from an empty line lands on the first row, not on a dead press", async () => {
  const { added } = tagSet({ offered: ["reading", "seedling"] });

  const line = await opened();
  await pressed(line, "ArrowDown");
  await pressed(line, "ArrowDown");
  await pressed(line, "Enter");

  expect(added).toHaveBeenCalledWith("seedling");
});

/** The bug this replaces: `⏎` used to create what was typed over the match it drew. */
test("enter takes the marked match rather than creating what was typed over it", async () => {
  const { added } = tagSet({ offered: ["quote", "question"] });

  const line = await opened();
  await typed(line, "qu");
  await pressed(line, "Enter");

  expect(added).toHaveBeenCalledWith("quote");
});

test("tab with nothing typed walks the offer from the top", async () => {
  const { added } = tagSet({ offered: ["reading", "seedling"] });

  const line = await opened();
  await pressed(line, "Tab");
  await pressed(line, "Enter");

  expect(added).toHaveBeenCalledWith("reading");
});

test("the arrows walk the offer both ways, wrapping", async () => {
  const { added } = tagSet({ offered: ["reading", "seedling"] });

  const line = await opened();
  await pressed(line, "ArrowUp");
  expect(
    screen
      .getByRole("option", { name: "seedling" })
      .getAttribute("aria-selected"),
  ).toBe("true");

  await pressed(line, "ArrowDown");
  await pressed(line, "Enter");
  expect(added).toHaveBeenCalledWith("reading");
});

test("escape and leaving the line put it away and take nothing", async () => {
  const { added } = tagSet({ offered: ["reading"] });

  let line = await opened();
  await typed(line, "rea");
  await pressed(line, "Escape");
  expect(screen.queryByRole("combobox")).toBeNull();

  line = await opened();
  await typed(line, "rea");
  await fireEvent.blur(line);
  expect(screen.queryByRole("combobox")).toBeNull();

  expect(added).not.toHaveBeenCalled();
});

test("a tag the item carries is removed by pressing it, then its ×", async () => {
  const { removed } = tagSet({ names: ["design", "notemap"] });

  const word = screen.getByRole("button", { name: "notemap" });
  expect(word.getAttribute("aria-pressed")).toBe("true");
  expect(screen.queryByRole("button", { name: "remove notemap" })).toBeNull();

  await fireEvent.click(word);
  expect(removed).not.toHaveBeenCalled();
  // Selected is ruled round, the × inside the rule, so the × has a word it
  // visibly belongs to.
  const remove = screen.getByRole("button", { name: "remove notemap" });
  expect(word.parentElement!.classList.contains("outline-ink")).toBe(true);
  expect(word.parentElement!.contains(remove)).toBe(true);
  expect(
    screen
      .getByRole("button", { name: "design" })
      .parentElement!.classList.contains("outline-ink"),
  ).toBe(false);

  await fireEvent.click(remove);
  expect(removed).toHaveBeenCalledWith("notemap");
  expect(screen.queryByRole("button", { name: "remove notemap" })).toBeNull();
});

test("pressing it again, esc, or pressing another tag deselects it", async () => {
  const { removed } = tagSet({ names: ["design", "notemap"] });

  const design = screen.getByRole("button", { name: "design" });
  const notemap = screen.getByRole("button", { name: "notemap" });

  await fireEvent.click(design);
  await fireEvent.click(design);
  expect(screen.queryByRole("button", { name: "remove design" })).toBeNull();

  await fireEvent.click(design);
  await fireEvent.keyDown(design, { key: "Escape" });
  expect(screen.queryByRole("button", { name: "remove design" })).toBeNull();

  await fireEvent.click(design);
  await fireEvent.click(notemap);
  expect(screen.queryByRole("button", { name: "remove design" })).toBeNull();
  expect(screen.getByRole("button", { name: "remove notemap" })).toBeDefined();

  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  expect(screen.queryByRole("button", { name: "remove notemap" })).toBeNull();

  expect(removed).not.toHaveBeenCalled();
});

test("a trigger tag that filed the item is inert, not a control", async () => {
  tagSet({
    names: ["route/research"],
    fires: (name) => (name.startsWith("route/") ? name.slice(6) : undefined),
    held: (name) => name === "route/research",
  });

  const tag = screen.getByText("research");
  expect(tag.tagName).toBe("SPAN");
  expect(tag.getAttribute("title")).toBe(
    "filed the item — cancel the routing to take it off",
  );
  expect(screen.queryByRole("button", { name: /research/ })).toBeNull();
});

/** The pointer marks a row the same way `↑↓` does, without moving the caret. */
test("the pointer marks a row it moves over, and the walk goes on from there", async () => {
  const { added } = tagSet({ offered: ["reading", "seedling", "writing"] });

  const line = await opened();
  await fireEvent.mouseEnter(screen.getByRole("option", { name: "seedling" }));
  await pressed(line, "ArrowDown");
  await pressed(line, "Enter");

  expect(added).toHaveBeenCalledWith("writing");
});

test("a carried tag typed again is not offered as new", async () => {
  tagSet({ names: ["reading"], offered: ["reading"] });

  const line = await opened();
  await typed(line, "reading");

  expect(options()).toEqual([]);
});

test("a trigger tag is marked with the template it applies, carried or offered", async () => {
  tagSet({
    names: ["route/research"],
    offered: ["route/reading"],
    fires: (name) => (name.startsWith("route/") ? name.slice(6) : undefined),
  });

  expect(
    screen.getByRole("button", { name: "route/research, routes to research" }),
  ).toBeDefined();

  await opened();
  expect(
    screen.getByRole("option", { name: /route\/reading.*reading/ }),
  ).toBeDefined();
});

/** Referenced so a rename cannot leave the fixture pointing at nothing. */
void Action;

test("a tag set that cannot be added to still holds the +'s place, unreachable", () => {
  const { container } = render(TagSet, {
    names: ["one"],
    offered: [],
    addable: false,
    onadd: vi.fn(),
    onremove: vi.fn(),
  });

  expect(screen.queryByRole("button", { name: "Add a tag" })).toBeNull();
  const held = [...container.querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "+",
  );
  expect(held?.className).toContain("invisible");
  expect(held?.getAttribute("tabindex")).toBe("-1");
  expect((held as HTMLButtonElement).disabled).toBe(true);
});
