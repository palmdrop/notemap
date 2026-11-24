import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import OrderSelector from "./OrderSelector.svelte";
import TagSet from "./TagSet.svelte";

test("the order selector reports which end the reader wants to start from", async () => {
  const chose = vi.fn();
  render(OrderSelector, { order: "oldest-first", onchoose: chose });

  const oldest = screen.getByRole("radio", { name: "Oldest first" });
  expect(oldest.getAttribute("aria-checked")).toBe("true");

  await fireEvent.click(screen.getByRole("radio", { name: "Newest first" }));
  expect(chose).toHaveBeenCalledWith("newest-first", "capture");
});

test("offers the feed the key as well as the end", async () => {
  const chose = vi.fn();
  render(OrderSelector, {
    order: "newest-first",
    by: "processed",
    keyed: true,
    onchoose: chose,
  });

  expect(
    screen
      .getByRole("radio", { name: "When processed" })
      .getAttribute("aria-checked"),
  ).toBe("true");

  await fireEvent.click(screen.getByRole("radio", { name: "Oldest first" }));
  expect(chose).toHaveBeenCalledWith("oldest-first", "processed");

  await fireEvent.click(screen.getByRole("radio", { name: "When captured" }));
  expect(chose).toHaveBeenCalledWith("newest-first", "capture");
});

function tagSet(
  props: Partial<{
    names: readonly string[];
    offered: readonly string[];
    fires: (name: string) => string | undefined;
    held: (name: string) => boolean;
    addable: boolean;
    field: boolean;
  }> = {},
) {
  const added = vi.fn();
  const removed = vi.fn();
  const { container } = render(TagSet, {
    names: [],
    offered: [],
    ...props,
    onadd: added,
    onremove: removed,
  });
  return { added, removed, container };
}

const opened = async () => {
  await fireEvent.click(screen.getByRole("button", { name: "Add a tag" }));
  return screen.getByRole("combobox", { name: "Add a tag" });
};

const typed = (line: HTMLElement, value: string) =>
  fireEvent.input(line, { target: { value } });

const pressed = (line: HTMLElement, key: string) =>
  fireEvent.keyDown(line, { key });

/** A row's words as a screen reader has them, without what is drawn for the eye alone. */
const options = () =>
  screen.queryAllByRole("option").map((one) => {
    const read = one.cloneNode(true) as HTMLElement;
    for (const hidden of read.querySelectorAll("[aria-hidden='true']")) {
      hidden.remove();
    }
    return read.textContent?.replace(/\s+/g, " ").trim();
  });

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
  expect(options()).toEqual(["recipe", "+ rec"]);
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

/** A tag that files the item is not read among the others. */
test("an empty line offers trigger tags apart beneath the rest, and typing mixes them back by match", async () => {
  const many = Array.from({ length: 10 }, (_, at) => `tag-${String(at)}`);
  const { container } = render(TagSet, {
    names: [],
    offered: ["route/research", ...many, "route/journal"],
    fires: (name: string) =>
      name.startsWith("route/") ? name.slice("route/".length) : undefined,
    onadd: vi.fn(),
    onremove: vi.fn(),
  });

  const line = await opened();
  const rule = () =>
    container.querySelector("[role='listbox'] > [aria-hidden='true']");
  expect(options()).toEqual([
    ...many.slice(0, 8),
    "route/research, routes to research",
    "route/journal, routes to journal",
  ]);
  expect(rule()?.nextElementSibling?.getAttribute("role")).toBe("option");
  expect(rule()?.previousElementSibling?.textContent).toContain("tag-7");

  await typed(line, "r");
  expect(rule()).toBeNull();
  expect(options()[0]).toBe("route/research, routes to research");

  // The walk passes the rule as though it were not there.
  await typed(line, "");
  for (let step = 0; step < 9; step++) await pressed(line, "ArrowDown");
  expect(screen.getByRole("option", { selected: true }).textContent).toContain(
    "route/research",
  );
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

test("a carried tag is marked #, and the mark is no part of its name", () => {
  const { container } = tagSet({ names: ["design"] });

  const word = container.querySelector("[data-tag='design'] > span")!;
  expect(word.textContent?.trim()).toBe("#design");
});

test("where tags can be changed each carries its ×, and pressing it takes the tag off", async () => {
  const { removed } = tagSet({ names: ["design", "notemap"] });

  await fireEvent.click(screen.getByRole("button", { name: "remove notemap" }));
  expect(removed).toHaveBeenCalledWith("notemap");
  expect(screen.getByRole("button", { name: "remove design" })).toBeDefined();
});

test("where tags cannot be changed they are words, with no ×", () => {
  tagSet({ names: ["design"], addable: false });

  expect(screen.queryByRole("button", { name: "remove design" })).toBeNull();
  expect(screen.queryByRole("button", { name: "design" })).toBeNull();
});

/** The `+` wraps where the line would, so opening the line moves nothing. */
test("the + holds the place the line opens into", async () => {
  tagSet({ names: ["design"] });
  const plus = screen.getByRole("button", { name: "Add a tag" });
  const place = plus.parentElement!.parentElement!;
  expect(place.classList.contains("min-w-tag-line")).toBe(true);

  await fireEvent.click(plus);

  expect(place.contains(screen.getByRole("combobox"))).toBe(true);
});

test("a trigger tag that filed the item is inert, not a control", async () => {
  tagSet({
    names: ["route/research"],
    fires: (name) => (name.startsWith("route/") ? name.slice(6) : undefined),
    held: (name) => name === "route/research",
  });

  const tag = screen.getByText("research");
  expect(tag.tagName).toBe("SPAN");
  expect(tag.closest("[title]")?.getAttribute("title")).toBe(
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

  expect(screen.getByText("route/research, routes to research")).toBeDefined();

  await opened();
  expect(
    screen.getByRole("option", { name: "route/reading, routes to reading" }),
  ).toBeDefined();
});

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
    (button) => button.textContent?.replace(/\s+/g, " ").trim() === "+ tag",
  );
  expect(held?.getAttribute("aria-hidden")).toBe("true");
  expect(held?.getAttribute("tabindex")).toBe("-1");
  expect((held as HTMLButtonElement).disabled).toBe(true);
});

/** The offer narrows at typing speed; its panel turns toward each new height from where it stands. */
test("the offer's panel grows and shrinks with the narrowing, from the height it stood at", async () => {
  tagSet({ offered: ["reading", "research", "design"] });
  const line = await opened();
  const list = screen.getByRole("listbox", {
    name: "Tags in use",
  }).parentElement!;

  const tall = () => list.querySelectorAll("[role='option']").length * 20;
  Object.defineProperty(list, "offsetHeight", { get: tall });
  list.getBoundingClientRect = () => ({ height: tall() }) as DOMRect;
  const animate = vi.fn();
  Object.assign(list, { animate, getAnimations: () => [] });
  document.documentElement.style.setProperty("--duration-short", "150ms");

  try {
    await typed(line, "rea");

    const [frames] = animate.mock.calls.at(-1) as [{ height: string }[]];
    expect(frames.map((frame) => frame.height)).toEqual(["60px", "40px"]);
  } finally {
    document.documentElement.style.removeProperty("--duration-short");
  }
});

/**
 * The browser keeps the offer under the line as the line moves, so nothing
 * here measures it: the line's place is named, and the offer is placed
 * against it. The place outlives the line, which is gone the moment it
 * closes while the offer is still sliding shut beneath it.
 */
test("as a field, the line stands over the tags and stays, its offer with it, and takes one tag after another", async () => {
  const { added, container } = tagSet({
    field: true,
    names: ["home"],
    offered: ["reading", "research"],
  });

  const line = screen.getByRole("combobox", { name: "Add a tag" });
  const chip = container.querySelector("[data-tag='home']")!;
  expect(
    line.compareDocumentPosition(chip) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(options()).toEqual(["reading", "research"]);

  await typed(line, "rea");
  await pressed(line, "Enter");
  expect(added).toHaveBeenCalledWith("reading");
  expect(screen.getByRole("combobox", { name: "Add a tag" })).toBe(line);
  expect((line as HTMLInputElement).value).toBe("");

  await fireEvent.blur(line);
  expect(screen.getByRole("listbox", { name: "Tags in use" })).toBeDefined();
});

test("as a field, esc on an empty line is left to what holds it", async () => {
  tagSet({ field: true });
  const line = screen.getByRole("combobox", { name: "Add a tag" });
  const outside = vi.fn();
  document.addEventListener("keydown", outside);

  await typed(line, "re");
  // A sheet's dialog closes on the key's default, not on hearing it.
  expect(await pressed(line, "Escape")).toBe(false);
  expect((line as HTMLInputElement).value).toBe("");
  expect(outside).not.toHaveBeenCalled();

  expect(await pressed(line, "Escape")).toBe(true);
  expect(outside).toHaveBeenCalledTimes(1);
  document.removeEventListener("keydown", outside);
});

test("the offer hangs from the line's place, which outlives the line", async () => {
  tagSet({ offered: ["reading", "research", "design"] });
  const line = await opened();
  await typed(line, "re");

  const offer = screen.getByRole("listbox", {
    name: "Tags in use",
  }).parentElement!.parentElement!;
  const place = line.parentElement!;
  const named = /anchor-name:\s*(--[\w-]+)/.exec(
    place.getAttribute("style") ?? "",
  )?.[1];

  expect(named).toBeDefined();
  expect(offer.getAttribute("style")).toContain(`position-anchor: ${named}`);
  expect(offer.classList.contains("offer")).toBe(true);

  await fireEvent.keyDown(line, { key: "Escape" });
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(place.isConnected).toBe(true);
  expect(place.getAttribute("style")).toContain(`anchor-name: ${named}`);
});
