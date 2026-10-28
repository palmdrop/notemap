import { describe, expect, it } from "vitest";

import {
  AT_ONCE_BYTES,
  asksFirst,
  carriesFiles,
  droppedOf,
  foldersOf,
  isField,
  pastedFiles,
} from "./dropped";

const shot = new File(["png"], "shot.png", { type: "image/png" });

function clipboard(types: string[], files: File[] = []) {
  return { types, files: files as unknown as FileList };
}

describe("carriesFiles", () => {
  it("is a drag of files, and not of text or a link", () => {
    expect(carriesFiles(["Files"])).toBe(true);
    expect(carriesFiles(["text/plain", "text/uri-list"])).toBe(false);
  });
});

describe("pastedFiles", () => {
  it("takes the files of a clipboard that holds nothing else", () => {
    expect(pastedFiles(clipboard(["Files"], [shot]))).toEqual([shot]);
  });

  it("takes a copied image that carries markup beside it", () => {
    expect(pastedFiles(clipboard(["text/html", "Files"], [shot]))).toEqual([
      shot,
    ]);
  });

  it("takes nothing where the clipboard carries text too", () => {
    expect(
      pastedFiles(clipboard(["text/plain", "text/html", "Files"], [shot])),
    ).toEqual([]);
  });

  it("takes nothing from no clipboard", () => {
    expect(pastedFiles(null)).toEqual([]);
  });
});

describe("isField", () => {
  it("is something typed into", () => {
    expect(isField(document.createElement("textarea"))).toBe(true);
    expect(isField(document.createElement("input"))).toBe(true);
    expect(isField(document.createElement("select"))).toBe(true);
  });

  it("is not the page, a button, an input that takes no text, or nothing", () => {
    const box = document.createElement("input");
    box.type = "checkbox";
    expect(isField(box)).toBe(false);
    expect(isField(document.body)).toBe(false);
    expect(isField(document.createElement("button"))).toBe(false);
    expect(isField(null)).toBe(false);
  });
});

describe("asksFirst", () => {
  const sized = (size: number) => ({ size });

  it("asks nothing of a few small files", () => {
    expect(asksFirst([])).toBe(false);
    expect(asksFirst([sized(1), sized(1), sized(1)])).toBe(false);
    expect(asksFirst([sized(AT_ONCE_BYTES - 1)])).toBe(false);
  });

  it("asks of more than a few, however small", () => {
    expect(asksFirst([sized(1), sized(1), sized(1), sized(1)])).toBe(true);
  });

  it("asks of a few that are large together", () => {
    expect(asksFirst([sized(AT_ONCE_BYTES)])).toBe(true);
    expect(
      asksFirst([sized(AT_ONCE_BYTES / 2), sized(AT_ONCE_BYTES / 2)]),
    ).toBe(true);
  });
});

describe("droppedOf", () => {
  it("takes the files where the browser lists no items", () => {
    expect(droppedOf({ files: [shot] as unknown as FileList })).toEqual([shot]);
  });

  it("takes an entry where an item offers one, and the file where it does not", () => {
    const entry = { name: "notes", isDirectory: true };
    const items = [
      { kind: "file", webkitGetAsEntry: () => entry, getAsFile: () => null },
      { kind: "file", webkitGetAsEntry: () => null, getAsFile: () => shot },
      { kind: "string", webkitGetAsEntry: () => null, getAsFile: () => null },
    ];
    expect(
      droppedOf({
        files: [] as unknown as FileList,
        items: items as unknown as DataTransferItemList,
      }),
    ).toEqual([entry, shot]);
  });
});

describe("foldersOf", () => {
  it("is the entries that are folders", () => {
    const notes = { name: "notes", isDirectory: true };
    const loose = { name: "a.md", isDirectory: false };
    expect(foldersOf([notes, loose, shot])).toEqual([notes]);
  });
});
