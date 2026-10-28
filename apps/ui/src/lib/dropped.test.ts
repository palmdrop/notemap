import { describe, expect, it } from "vitest";

import { carriesFiles, isField, pastedFiles } from "./dropped";

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

  it("is not the page, a button or nothing", () => {
    expect(isField(document.body)).toBe(false);
    expect(isField(document.createElement("button"))).toBe(false);
    expect(isField(null)).toBe(false);
  });
});
