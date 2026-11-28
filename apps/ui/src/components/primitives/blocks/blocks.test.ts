import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { expect, test, vi } from "vitest";

import { viewport } from "$testing/dom";
import Pieces from "./Pieces.fixture.svelte";

test("a segmented choice fills the chosen part, and choosing it again does nothing", async () => {
  const onpress = vi.fn();
  render(Pieces, { onpress });

  const oldest = screen.getByRole("radio", { name: "Oldest first" });
  const newest = screen.getByRole("radio", { name: "Newest first" });
  expect(oldest.getAttribute("aria-checked")).toBe("true");

  await fireEvent.click(oldest);
  expect(onpress).not.toHaveBeenCalled();

  await fireEvent.click(newest);
  expect(onpress).toHaveBeenCalledWith("newest");
  expect(newest.getAttribute("aria-checked")).toBe("true");
  expect(oldest.getAttribute("aria-checked")).toBe("false");
});

test("a segmented choice is a radio group: one part in the tab order, the arrows moving the choice", async () => {
  const onpress = vi.fn();
  render(Pieces, { onpress });

  const oldest = screen.getByRole("radio", { name: "Oldest first" });
  const newest = screen.getByRole("radio", { name: "Newest first" });
  expect(oldest.tabIndex).toBe(0);
  expect(newest.tabIndex).toBe(-1);

  await fireEvent.keyDown(oldest, { key: "ArrowRight" });
  expect(onpress).toHaveBeenCalledWith("newest");
  expect(document.activeElement).toBe(newest);
});

test("a segmented choice's fill stands under the chosen part, and moves to the next one chosen", async () => {
  // jsdom lays nothing out: each part says where it is from its label.
  const at = vi
    .spyOn(HTMLElement.prototype, "offsetLeft", "get")
    .mockImplementation(function (this: HTMLElement) {
      return this.textContent?.includes("Newest") === true ? 120 : 4;
    });
  const wide = vi
    .spyOn(HTMLElement.prototype, "offsetWidth", "get")
    .mockReturnValue(110);
  render(Pieces, { onpress: vi.fn() });

  const group = screen.getByRole("radiogroup", { name: "Order" });
  const fill = () =>
    group.querySelector<HTMLElement>(':scope > [aria-hidden="true"]')!;
  expect(fill().style.left).toBe("4px");
  expect(fill().style.width).toBe("110px");

  await fireEvent.click(screen.getByRole("radio", { name: "Newest first" }));
  expect(fill().style.left).toBe("120px");

  at.mockRestore();
  wide.mockRestore();
});

test("boxes that can all be on are each ticked when on", async () => {
  render(Pieces);

  const home = screen.getByRole("button", { name: "#home" });
  const work = screen.getByRole("button", { name: "#work" });
  expect(home.getAttribute("aria-pressed")).toBe("true");
  expect(home.querySelector("[data-icon=check]")).not.toBeNull();

  await fireEvent.click(work);
  expect(work.getAttribute("aria-pressed")).toBe("true");
  expect(home.getAttribute("aria-pressed")).toBe("true");
});

test("radio rows pick one, each saying what it does", async () => {
  render(Pieces);

  const make = screen.getByRole("radio", { name: /Make it/ });
  const must = screen.getByRole("radio", { name: /Must exist/ });
  expect(make.getAttribute("aria-checked")).toBe("true");
  expect(must.textContent).toContain("Refused if it is not there.");

  await fireEvent.click(must);
  expect(must.getAttribute("aria-checked")).toBe("true");
  expect(make.getAttribute("aria-checked")).toBe("false");
});

test("a main action that cannot be taken yet stays in its place, and the line over the bar says why", async () => {
  viewport(390);
  const onpress = vi.fn();
  render(Pieces, { why: "Pick a destination to save.", onpress });

  const route = screen.getByRole("button", { name: "Route" });
  expect(route.getAttribute("aria-disabled")).toBe("true");
  expect(route.className).toContain("border-dashed");
  expect(screen.getByText("Pick a destination to save.")).toBeDefined();

  await fireEvent.click(route);
  expect(onpress).not.toHaveBeenCalled();
});

test("with the keyboard up on a phone the bar is one short row, the others icons and the main one small", async () => {
  viewport(390);
  render(Pieces);
  const field = document.createElement("input");
  document.body.append(field);

  field.focus();
  await tick();
  const manual = screen.getByRole("button", { name: "Manual" });
  expect(manual.querySelector(".sr-only")?.textContent).toBe("Manual");
  expect(screen.getByRole("button", { name: "Route" }).className).toContain(
    "flex-none",
  );

  // Pressed, the field keeps the focus, and the bar its shape.
  const pressed = await fireEvent.mouseDown(manual);
  expect(pressed).toBe(false);

  field.blur();
  await tick();
  expect(manual.querySelector(".sr-only")).toBeNull();
  expect(screen.getByRole("button", { name: "Route" }).className).toContain(
    "flex-1",
  );
  field.remove();
});

test("the bar docks at the foot at every width, and when wide it names its keys", () => {
  viewport(390);
  const { unmount } = render(Pieces);
  expect(
    screen.getByRole("toolbar", { name: "Actions" }).parentElement?.dataset[
      "bar"
    ],
  ).toBe("foot");
  expect(
    screen.getByRole("button", { name: "Manual" }).getAttribute("title"),
  ).toBeNull();
  unmount();

  viewport(1440);
  render(Pieces);
  expect(
    screen.getByRole("toolbar", { name: "Actions" }).parentElement?.dataset[
      "bar"
    ],
  ).toBe("foot");
  expect(
    screen.getByRole("button", { name: "Manual" }).getAttribute("title"),
  ).toBe("Manual (m)");
  expect(
    screen.getByRole("button", { name: "Discard" }).getAttribute("title"),
  ).toBe("Discard (D)");
});

test("a sheet rises from the foot on a phone, and is a panel or a dialog when wide", async () => {
  viewport(390);
  const first = render(Pieces, { sheet: true });
  expect(document.querySelector("dialog")?.dataset["sheet"]).toBe("sheet");
  first.unmount();

  viewport(1440);
  const second = render(Pieces, { sheet: true });
  expect(document.querySelector("dialog")?.dataset["sheet"]).toBe("panel");
  second.unmount();

  render(Pieces, { sheet: true, sheetForm: "dialog" });
  expect(document.querySelector("dialog")?.dataset["sheet"]).toBe("dialog");
});

test("a sheet closes by its ×, by esc, and by the veil, and says so once", async () => {
  const onclose = vi.fn();
  render(Pieces, { sheet: true, onclose });

  await fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onclose).toHaveBeenCalledTimes(1);
  expect(document.querySelector("dialog")).toBeNull();

  await fireEvent.click(screen.getByRole("button", { name: "Open the sheet" }));
  const dialog = document.querySelector("dialog")!;
  await fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(onclose).toHaveBeenCalledTimes(2);

  await fireEvent.click(screen.getByRole("button", { name: "Open the sheet" }));
  await fireEvent.click(document.querySelector(".bg-veil")!);
  expect(onclose).toHaveBeenCalledTimes(3);
});

test("a dialog answers with the way chosen, keeps things as they are first, and answers nothing when dismissed", async () => {
  const onanswer = vi.fn();
  render(Pieces, { dialog: true, onanswer });

  const keep = screen.getByRole("button", { name: "Keep editing" });
  expect(document.activeElement).toBe(keep);

  await fireEvent.click(screen.getByRole("button", { name: "Lose changes" }));
  expect(onanswer).toHaveBeenCalledWith("lose");

  await fireEvent.click(screen.getByRole("button", { name: "Ask" }));
  await fireEvent(
    document.querySelector("dialog")!,
    new Event("cancel", { cancelable: true }),
  );
  expect(onanswer).toHaveBeenLastCalledWith(undefined);
});

test("a band is the grey heading, and under settings a quiet label under a rule", async () => {
  const { default: Banded } = await import("./Band.fixture.svelte");
  const { unmount } = render(Banded);
  expect(screen.getByRole("heading", { name: "where" }).className).toContain(
    "bg-band",
  );
  unmount();

  render(Banded, { quiet: true });
  const quiet = screen.getByRole("heading", { name: "where" });
  expect(quiet.className).not.toContain("bg-band");
  expect(quiet.className).toContain("text-muted");
});
