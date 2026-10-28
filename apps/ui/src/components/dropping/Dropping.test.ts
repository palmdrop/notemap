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

async function dragOver(): Promise<DragEvent> {
  const event = createEvent.dragOver(document.body, dragged(["Files"]));
  await fireEvent(document.body, event);
  return event as DragEvent;
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

test("takes nothing while what receives is being sent, the overlay having said so", async () => {
  const take = receiving({ busy: () => true });
  render(Dropping);

  await fireEvent.dragEnter(document.body, dragged(["Files"]));
  expect(screen.getByRole("status").textContent).toContain(
    "the capture is being sent",
  );
  expect((await dragOver()).dataTransfer?.dropEffect).toBe("none");

  const before = notices.latest;
  await drop(document.body, [shot]);
  await new Promise((settled) => setTimeout(settled, 0));
  expect(take).not.toHaveBeenCalled();
  expect(notices.latest).toBe(before);
});

test("offers a copy where something takes the files, and nothing where nothing does", async () => {
  render(Dropping);
  expect((await dragOver()).dataTransfer?.dropEffect).toBe("none");

  receiving();
  expect((await dragOver()).dataTransfer?.dropEffect).toBe("copy");
});

test("lets the overlay go once the drag has gone quiet, its leave lost", async () => {
  vi.useFakeTimers();
  try {
    receiving();
    render(Dropping);

    await fireEvent.dragEnter(document.body, dragged(["Files"]));
    await vi.advanceTimersByTimeAsync(900);
    await dragOver();
    await vi.advanceTimersByTimeAsync(900);
    expect(screen.queryByRole("status")).not.toBeNull();

    await vi.advanceTimersByTimeAsync(200);
    await vi.waitFor(() => {
      expect(screen.queryByRole("status")).toBeNull();
    });
  } finally {
    vi.useRealTimers();
  }
});

test("raises nothing for a drag that started on the page, until the pointer moves again", async () => {
  receiving();
  render(Dropping);

  await fireEvent.dragStart(document.body);
  await fireEvent.dragEnter(document.body, dragged(["Files"]));
  expect(screen.queryByRole("status")).toBeNull();
  await fireEvent.dragEnd(document.body);

  await fireEvent.dragStart(document.body);
  await fireEvent.pointerMove(document.body);
  await fireEvent.dragEnter(document.body, dragged(["Files"]));
  expect(screen.queryByRole("status")).not.toBeNull();
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

test("gives a paste to the field it lands in, though an edit outranks its owner", async () => {
  const field = document.createElement("textarea");
  document.body.append(field);
  const box = receiving({ owns: (target) => target === field });
  const edit = receiving({ name: "09:12: some words", edit: true });
  render(Dropping);

  await paste(field, ["Files"], [shot]);
  await vi.waitFor(() => {
    expect(box).toHaveBeenCalledWith([shot]);
  });
  expect(edit).not.toHaveBeenCalled();

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
  // What the files are is bold, and what is said of them is not.
  expect(within(dialog).getByText("7 files").tagName).toBe("STRONG");
  expect(within(dialog).getByText("7 bytes").tagName).toBe("STRONG");
  expect(
    within(dialog).getByText("4.md").classList.contains("font-semibold"),
  ).toBe(true);
  expect(
    within(dialog).getByText("and 2 more").classList.contains("font-semibold"),
  ).toBe(false);
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

test("nothing arrives while a dialog is open, and nothing says it would", async () => {
  const take = receiving();
  render(Dropping);

  await drop(document.body, many(4));
  const dialog = await screen.findByRole("dialog");

  await fireEvent.dragEnter(document.body, dragged(["Files"]));
  expect(screen.queryByRole("status")).toBeNull();
  const over = await dragOver();
  expect(over.dataTransfer?.dropEffect).toBe("none");

  const late = await drop(document.body, [shot]);
  expect(late.defaultPrevented).toBe(true);
  await paste(document.body, ["Files"], [shot]);

  await fireEvent.click(within(dialog).getByRole("button", { name: "cancel" }));
  await vi.waitFor(() => {
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  await new Promise((settled) => setTimeout(settled, 0));
  expect(take).not.toHaveBeenCalled();
});

test("a drop made while a folder is being read waits its turn", async () => {
  const take = receiving();
  render(Dropping);

  let open = () => {};
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  const inside = new File(["a"], "a.md");
  await dropItems([folder("notes", [inside], opened)]);
  await drop(document.body, [shot]);
  expect(take).not.toHaveBeenCalled();

  open();
  await vi.waitFor(() => {
    expect(take).toHaveBeenCalledTimes(2);
  });
  expect(take.mock.calls).toEqual([[[inside]], [[shot]]]);
});

test("quotes the capture being edited where it asks", async () => {
  receiving({ name: "09:12: some words", edit: true });
  render(Dropping);

  await drop(document.body, many(4));

  const dialog = await screen.findByRole("dialog");
  expect(dialog.textContent).toContain("to “09:12: some words”");
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

test("names the file it could not read, where no folder was dropped", async () => {
  receiving();
  render(Dropping);

  const locked = {
    name: "locked.md",
    isDirectory: false,
    file: (_ok: unknown, fail: (error: unknown) => void) => {
      fail(new Error("NotReadableError"));
    },
  };
  await dropItems([
    { kind: "file", webkitGetAsEntry: () => locked, getAsFile: () => null },
  ]);

  await vi.waitFor(() => {
    expect(notices.latest?.what).toBe("locked.md: could not be read");
  });
});
