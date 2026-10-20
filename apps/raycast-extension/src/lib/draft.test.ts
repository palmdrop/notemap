import { afterEach, describe, expect, it, vi } from "vitest";

import { drafts, EMPTY, type Storage } from "./draft";

function memory(): Storage & { readonly held: Map<string, string> } {
  const held = new Map<string, string>();
  return {
    held,
    getItem: (key) => Promise.resolve(held.get(key)),
    setItem: (key, value) => {
      held.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key) => {
      held.delete(key);
      return Promise.resolve();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the capture form's draft", () => {
  it("is empty where nothing was kept", async () => {
    expect(await drafts(memory()).read()).toEqual(EMPTY);
  });

  it("comes back as it was kept", async () => {
    const shelf = drafts(memory());
    const draft = {
      text: "a note",
      picked: ["route/todo"],
      typed: "new, ones",
    };

    await shelf.keep(draft);

    expect(await shelf.read()).toEqual(draft);
  });

  it("is let go of once dropped", async () => {
    const storage = memory();
    const shelf = drafts(storage);

    await shelf.keep({ text: "a note", picked: [], typed: "" });
    await shelf.drop();

    expect(storage.held.size).toBe(0);
    expect(await shelf.read()).toEqual(EMPTY);
  });

  it("holds nothing for a form that holds nothing", async () => {
    const storage = memory();
    const shelf = drafts(storage);

    await shelf.keep({ text: "a note", picked: [], typed: "" });
    await shelf.keep({ text: "  ", picked: [], typed: "" });

    expect(storage.held.size).toBe(0);
  });

  it("stays dropped when a keep was still on its way", async () => {
    const storage = memory();
    const slow: Storage = {
      ...storage,
      setItem: async (key, value) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        storage.held.set(key, value);
      },
    };
    const shelf = drafts(slow);

    const kept = shelf.keep({ text: "a note", picked: [], typed: "" });
    const dropped = shelf.drop();
    await Promise.all([kept, dropped]);

    expect(storage.held.size).toBe(0);
  });

  it("writes only the latest of the keeps that waited behind one", async () => {
    const storage = memory();
    const written: string[] = [];
    const slow: Storage = {
      ...storage,
      setItem: async (key, value) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        written.push(value);
        storage.held.set(key, value);
      },
    };
    const shelf = drafts(slow);

    const kept = ["a", "a n", "a no", "a note"].map((text) =>
      shelf.keep({ text, picked: [], typed: "" }),
    );
    await Promise.all(kept);

    expect(written.map((value) => JSON.parse(value).text)).toEqual([
      "a",
      "a note",
    ]);
    expect(await shelf.read()).toEqual({
      text: "a note",
      picked: [],
      typed: "",
    });
  });

  it("goes on writing after a write that failed", async () => {
    const storage = memory();
    let failing = true;
    const flaky: Storage = {
      ...storage,
      setItem: (key, value) => {
        if (failing) {
          failing = false;
          return Promise.reject(new Error("storage is unwell"));
        }
        return storage.setItem(key, value);
      },
    };
    const shelf = drafts(flaky);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      shelf.keep({ text: "lost", picked: [], typed: "" }),
    ).resolves.toBeUndefined();
    await shelf.keep({ text: "a note", picked: [], typed: "" });

    expect(await shelf.read()).toEqual({
      text: "a note",
      picked: [],
      typed: "",
    });
  });

  it("lets a read that failed say so", async () => {
    const storage = memory();
    const broken: Storage = {
      ...storage,
      getItem: () => Promise.reject(new Error("storage is unwell")),
    };

    await expect(drafts(broken).read()).rejects.toThrow("storage is unwell");
  });

  it("reads anything it cannot make sense of as empty", async () => {
    const storage = memory();
    storage.held.set("capture-draft", "not json");

    expect(await drafts(storage).read()).toEqual(EMPTY);
  });

  it("keeps what it can of a draft in a shape it half knows", async () => {
    const storage = memory();
    storage.held.set(
      "capture-draft",
      JSON.stringify({ text: "a note", picked: ["one", 2], typed: null }),
    );

    expect(await drafts(storage).read()).toEqual({
      text: "a note",
      picked: ["one"],
      typed: "",
    });
  });
});
