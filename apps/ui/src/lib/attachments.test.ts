import { describe, expect, it } from "vitest";

import { drawn, sizeOf } from "./attachments";

describe("an attachment's size", () => {
  it("is said in decimal units, as a file manager says it", () => {
    expect(sizeOf(4)).toBe("4 bytes");
    expect(sizeOf(1500)).toBe("1.5 KB");
    expect(sizeOf(517190)).toBe("517 KB");
    expect(sizeOf(268435456)).toBe("268 MB");
    expect(sizeOf(3_200_000_000)).toBe("3.2 GB");
  });
});

describe("what is drawn as a picture", () => {
  it("is the first two images, in slot order, whatever is between them", () => {
    const one = { asset: "1", url: "1", mime: "image/png" };
    const paper = { asset: "2", url: "2", mime: "application/pdf" };
    const two = { asset: "3", url: "3", mime: "image/jpeg" };
    const three = { asset: "4", url: "4", mime: "image/webp" };
    const unknown = { asset: "5", url: "5" };

    expect(drawn([one, paper, two, three, unknown])).toEqual({
      pictures: [one, two],
      lines: [paper, three, unknown],
    });
  });
});
