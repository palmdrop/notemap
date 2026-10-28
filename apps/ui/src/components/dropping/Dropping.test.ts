import {
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { receives, type Receiver } from "$lib/receiving.svelte";

import Dropping from "./Dropping.svelte";

const shot = new File(["png"], "shot.png", { type: "image/png" });

let stops: (() => void)[] = [];

afterEach(() => {
  for (const stop of stops) stop();
  stops = [];
});

function receiving(over: Partial<Receiver> = {}) {
  const take = vi.fn<(files: readonly File[]) => void>();
  stops.push(
    receives({
      name: "the capture",
      edit: false,
      busy: () => false,
      owns: () => false,
      take,
      ...over,
    }),
  );
  return take;
}

function dragged(types: string[], files: File[] = []) {
  return { dataTransfer: { types, files, dropEffect: "none" } };
}

async function drop(on: Element, files: File[]): Promise<Event> {
  const event = createEvent.drop(on, dragged(["Files"], files));
  await fireEvent(on, event);
  return event;
}

async function paste(on: Element, types: string[], files: File[] = []) {
  const event = createEvent.paste(on, { clipboardData: { types, files } });
  await fireEvent(on, event);
  return event;
}

test("says where files dragged over the page would go, until they leave it", async () => {
  receiving();
  render(Dropping);

  await fireEvent.dragEnter(document.body, dragged(["Files"]));
  expect(screen.getByRole("status").textContent).toContain(
    "attach to the capture",
  );

  await fireEvent.dragEnter(document.body, dragged(["Files"]));
  await fireEvent.dragLeave(document.body, dragged(["Files"]));
  expect(screen.queryByRole("status")).not.toBeNull();

  await fireEvent.dragLeave(document.body, dragged(["Files"]));
  await vi.waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
});

test("names the edit over the box where both would take a file", async () => {
  receiving();
  receiving({ name: "09:12: some words", edit: true });
  render(Dropping);

  await fireEvent.dragEnter(document.body, dragged(["Files"]));
  expect(screen.getByRole("status").textContent).toContain(
    "attach to 09:12: some words",
  );
});

test("raises nothing for dragged text or a link", async () => {
  receiving();
  render(Dropping);

  await fireEvent.dragEnter(
    document.body,
    dragged(["text/plain", "text/uri-list"]),
  );
  expect(screen.queryByRole("status")).toBeNull();
});

test("hands a drop to whatever receives, and the overlay goes", async () => {
  const take = receiving();
  render(Dropping);

  await fireEvent.dragEnter(document.body, dragged(["Files"]));
  const event = await drop(document.body, [shot]);

  expect(event.defaultPrevented).toBe(true);
  expect(take).toHaveBeenCalledWith([shot]);
  await vi.waitFor(() => {
    expect(screen.queryByRole("status")).toBeNull();
  });
});

test("keeps a drop with nowhere to go from the browser, and draws nothing", async () => {
  render(Dropping);

  await fireEvent.dragEnter(document.body, dragged(["Files"]));
  expect(screen.queryByRole("status")).toBeNull();

  const event = await drop(document.body, [shot]);
  expect(event.defaultPrevented).toBe(true);
});

test("takes nothing while what receives is being sent, and says so", async () => {
  const take = receiving({ busy: () => true });
  render(Dropping);

  await fireEvent.dragEnter(document.body, dragged(["Files"]));
  expect(screen.getByRole("status").textContent).toContain(
    "the capture is being sent",
  );

  await drop(document.body, [shot]);
  expect(take).not.toHaveBeenCalled();
});

test("attaches a pasted image from no field, or from the receiver's own", async () => {
  const field = document.createElement("textarea");
  document.body.append(field);
  const take = receiving({ owns: (target) => target === field });
  render(Dropping);

  const fromPage = await paste(document.body, ["Files"], [shot]);
  expect(fromPage.defaultPrevented).toBe(true);
  expect(take).toHaveBeenCalledTimes(1);

  await paste(field, ["Files"], [shot]);
  expect(take).toHaveBeenCalledTimes(2);

  field.remove();
});

test("leaves a paste into any other field to that field", async () => {
  const other = document.createElement("input");
  document.body.append(other);
  const take = receiving();
  render(Dropping);

  const event = await paste(other, ["Files"], [shot]);
  expect(event.defaultPrevented).toBe(false);
  expect(take).not.toHaveBeenCalled();

  other.remove();
});

test("pastes text as text, though a picture of it came along", async () => {
  const take = receiving();
  render(Dropping);

  const event = await paste(
    document.body,
    ["text/plain", "text/html", "Files"],
    [shot],
  );
  expect(event.defaultPrevented).toBe(false);
  expect(take).not.toHaveBeenCalled();
});
