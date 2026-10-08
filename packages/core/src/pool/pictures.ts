import { imageSize } from "image-size";

import type { Dimensions } from "#types/domain/asset";

/**
 * How much of a picture is read to find its size. A JPEG's size follows its
 * metadata segments, which a camera can fill with a thumbnail and a colour
 * profile, so this is far more than a header.
 */
export const HEAD_BYTES = 512 * 1024;

/** EXIF orientations 5 to 8 turn the picture a quarter, so it is drawn with its sides swapped. */
const TURNED = 5;

export function isPicture(mime: string): boolean {
  return mime.toLowerCase().startsWith("image/");
}

/**
 * HEIC and AVIF keep a turn in a box of their own, which this reader does not
 * apply, so a portrait photograph would be answered on its side.
 */
function isTurnedElsewhere(head: Uint8Array): boolean {
  return new TextDecoder().decode(head.subarray(4, 8)) === "ftyp";
}

export function measure(head: Uint8Array): Dimensions | undefined {
  if (isTurnedElsewhere(head)) return undefined;
  try {
    const { width, height, orientation } = imageSize(head);
    if (!isSize(width) || !isSize(height)) return undefined;
    return orientation !== undefined && orientation >= TURNED
      ? { width: height, height: width }
      : { width, height };
  } catch {
    return undefined;
  }
}

function isSize(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Passes every chunk on unchanged, copying the first `HEAD_BYTES` aside as
 * they go by, so bytes on their way to a store are measured without being
 * read twice.
 */
export function keepingHead(bytes: AsyncIterable<Uint8Array>): {
  readonly bytes: AsyncIterable<Uint8Array>;
  readonly head: () => Uint8Array;
} {
  const kept: Uint8Array[] = [];
  let size = 0;

  async function* passing(): AsyncIterable<Uint8Array> {
    for await (const chunk of bytes) {
      if (size < HEAD_BYTES) {
        const part = chunk.slice(0, HEAD_BYTES - size);
        kept.push(part);
        size += part.length;
      }
      yield chunk;
    }
  }

  return { bytes: passing(), head: () => joined(kept, size) };
}

/** The first `HEAD_BYTES` of a stream, which is let go of once they are in. */
export async function headOf(
  bytes: AsyncIterable<Uint8Array>,
): Promise<Uint8Array> {
  const kept: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of bytes) {
    const part = chunk.slice(0, HEAD_BYTES - size);
    kept.push(part);
    size += part.length;
    if (size >= HEAD_BYTES) break;
  }
  return joined(kept, size);
}

function joined(parts: readonly Uint8Array[], size: number): Uint8Array {
  const whole = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.length;
  }
  return whole;
}
