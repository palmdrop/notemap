import { describe, expect, it, test } from "vitest";

import { heic, jpeg, png } from "#testing/pictures";

import {
  HEAD_BYTES,
  headOf,
  isPicture,
  keepingHead,
  measure,
} from "./pictures";

async function* chunked(
  bytes: Uint8Array,
  size: number,
): AsyncIterable<Uint8Array> {
  for (let at = 0; at < bytes.length; at += size) {
    yield bytes.slice(at, at + size);
  }
}

async function drained(bytes: AsyncIterable<Uint8Array>): Promise<number> {
  let length = 0;
  for await (const chunk of bytes) length += chunk.length;
  return length;
}

test("a picture is any media type under image/, however it is spelled", () => {
  expect(isPicture("image/png")).toBe(true);
  expect(isPicture("Image/PNG")).toBe(true);
  expect(isPicture("application/pdf")).toBe(false);
});

describe("measuring a picture from its bytes", () => {
  it("reads a PNG's size", () => {
    expect(measure(png(640, 480))).toEqual({ width: 640, height: 480 });
  });

  it("answers a photograph turned a quarter with its sides swapped, as it is drawn", () => {
    expect(measure(jpeg(4000, 3000, 6))).toEqual({ width: 3000, height: 4000 });
    expect(measure(jpeg(4000, 3000, 1))).toEqual({ width: 4000, height: 3000 });
  });

  it("answers nothing for a HEIC or an AVIF, whose turn it cannot read", () => {
    expect(measure(heic(4032, 3024))).toBeUndefined();
  });

  it("answers nothing for a size no picture could have", () => {
    const svg = (size: string) =>
      new TextEncoder().encode(
        `<svg xmlns="http://www.w3.org/2000/svg" ${size}></svg>`,
      );
    expect(measure(svg('viewBox="0 0 1e999 1"'))).toBeUndefined();
    expect(measure(svg('width="3" height="2"'))).toEqual({
      width: 3,
      height: 2,
    });
  });

  it("answers nothing for bytes that are not a picture, or not enough of one", () => {
    expect(measure(new TextEncoder().encode("a note"))).toBeUndefined();
    expect(measure(png(640, 480).slice(0, 12))).toBeUndefined();
  });
});

describe("keeping a stream's head while it passes", () => {
  it("passes every byte on and keeps the first of them aside", async () => {
    const whole = new Uint8Array(HEAD_BYTES + 1000).fill(7);
    whole.set(png(10, 20));
    const kept = keepingHead(chunked(whole, 4093));

    expect(await drained(kept.bytes)).toBe(whole.length);
    expect(kept.head().length).toBe(HEAD_BYTES);
    expect(measure(kept.head())).toEqual({ width: 10, height: 20 });
  });

  it("reads no further than the head", async () => {
    let read = 0;
    async function* counted(): AsyncIterable<Uint8Array> {
      for await (const chunk of chunked(new Uint8Array(HEAD_BYTES * 4), 4093)) {
        read += chunk.length;
        yield chunk;
      }
    }

    expect((await headOf(counted())).length).toBe(HEAD_BYTES);
    expect(read).toBeLessThan(HEAD_BYTES + 4093);
  });
});
