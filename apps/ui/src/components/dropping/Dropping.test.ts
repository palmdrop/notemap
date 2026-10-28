import {
  createEvent,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/svelte";
import { afterEach, expect, test, vi } from "vitest";

import { notices } from "$lib/notices.svelte";
import { receives, type Receiver } from "$lib/receiving.svelte";
import type { Entry } from "$lib/walking";

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
  await vi.waitFor(() => {
    expect(take).toHaveBeenCalledWith([shot]);
  });
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
  await vi.waitFor(() => {
    expect(take).toHaveBeenCalledTimes(1);
  });

  await paste(field, ["Files"], [shot]);
  await vi.waitFor(() => {
    expect(take).toHaveBeenCalledTimes(2);
  });

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

const many = (count: number) =>
  Array.from(
    { length: count },
    (_, at) => new File(["x"], `${String(at)}.md`, { type: "text/markdown" }),
  );

test("asks before attaching more than a few files, naming the first of them", async () => {
  const take = receiving();
  render(Dropping);

  const files = many(7);
  await drop(document.body, files);

  const dialog = await screen.findByRole("dialog", {
    name: "Attach these files",
  });
  expect(dialog.textContent).toContain(
    "attach 7 files, 7 bytes, to the capture",
  );
  expect(within(dialog).getByText("4.md")).toBeDefined();
  expect(within(dialog).queryByText("5.md")).toBeNull();
  expect(dialog.textContent).toContain("and 2 more");
  expect(take).not.toHaveBeenCalled();

  await fireEvent.click(within(dialog).getByRole("button", { name: "attach" }));
  await vi.waitFor(() => {
    expect(take).toHaveBeenCalledWith(files);
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});

test("asks before attaching one file that is large, and attaches nothing on cancel", async () => {
  const take = receiving();
  render(Dropping);

  const large = new File(["x"], "film.mov");
  Object.defineProperty(large, "size", { value: 40_000_000 });
  await drop(document.body, [large]);

  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("attach 1 file, 40 MB, to the capture");

  await fireEvent.click(within(dialog).getByRole("button", { name: "cancel" }));
  await vi.waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  expect(take).not.toHaveBeenCalled();
});

test("a drop made while another is asked about waits its turn", async () => {
  const take = receiving();
  render(Dropping);

  await drop(document.body, many(4));
  await drop(document.body, [shot]);

  const dialog = await screen.findByRole("dialog");
  expect(take).not.toHaveBeenCalled();

  await fireEvent.click(within(dialog).getByRole("button", { name: "cancel" }));
  await vi.waitFor(() => {
    expect(take).toHaveBeenCalledWith([shot]);
  });
});

test("says so where what would take them closed while they were asked about", async () => {
  const take = vi.fn();
  const stop = receives({
    name: "09:12: some words",
    edit: true,
    busy: () => false,
    owns: () => false,
    take,
  });
  render(Dropping);

  await drop(document.body, many(4));
  const dialog = await screen.findByRole("dialog");
  stop();

  await fireEvent.click(within(dialog).getByRole("button", { name: "attach" }));
  await vi.waitFor(() => {
    expect(notices.latest?.what).toBe(
      "09:12: some words was closed, nothing attached",
    );
  });
  expect(take).not.toHaveBeenCalled();
});

/** A folder as a browser hands it over, its reader answering once `opened` resolves. */
function folder(name: string, inside: File[], opened = Promise.resolve()) {
  const entries: Entry[] = inside.map((one) => ({
    name: one.name,
    isDirectory: false,
    file: (ok: (file: File) => void) => {
      ok(one);
    },
  }));
  let read = false;
  const entry = {
    name,
    isDirectory: true,
    createReader: () => ({
      readEntries: (ok: (entries: Entry[]) => void) => {
        void opened.then(() => {
          ok(read ? [] : entries);
          read = true;
        });
      },
    }),
  };
  return {
    kind: "file",
    webkitGetAsEntry: () => entry,
    getAsFile: () => null,
  };
}

async function dropItems(items: unknown[]): Promise<void> {
  await fireEvent.drop(document.body, {
    dataTransfer: { types: ["Files"], files: [], items },
  });
}

test("says it is reading a dropped folder, then attaches what it holds", async () => {
  const take = receiving();
  render(Dropping);

  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  const inside = [new File(["a"], "a.md"), new File(["b"], ".hidden")];
  await dropItems([folder("notes", inside, opened)]);

  expect((await screen.findByRole("status")).textContent).toContain(
    "reading notes…",
  );

  open();
  await vi.waitFor(() => {
    expect(take).toHaveBeenCalledWith([inside[0]]);
  });
  expect(notices.latest?.what).toBe(
    "1 hidden file or folder left out of notes",
  );
});

test("refuses a folder holding more than the walk reads, attaching nothing", async () => {
  const take = receiving();
  render(Dropping);

  await dropItems([folder("home", many(501))]);

  await vi.waitFor(() => {
    expect(notices.latest?.what).toBe(
      "home: more than 500 files, nothing attached",
    );
  });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(take).not.toHaveBeenCalled();
});
