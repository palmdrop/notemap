/** The least of a PNG that says its size: the signature and the header chunk. */
export function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes.set([8, 2, 0, 0, 0], 24);
  return bytes;
}

/** A JPEG carrying an EXIF orientation, and a frame header saying its size as stored. */
export function jpeg(
  width: number,
  height: number,
  orientation: number,
): Uint8Array {
  const tiff = [
    0x4d,
    0x4d,
    0x00,
    0x2a,
    0x00,
    0x00,
    0x00,
    0x08,
    0x00,
    0x01,
    0x01,
    0x12,
    0x00,
    0x03,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    orientation,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ];
  const exif = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const app1 = [0xff, 0xe1, 0x00, exif.length + 2, ...exif];
  const sof = [
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
  ];
  return new Uint8Array([0xff, 0xd8, ...app1, ...sof, 0xff, 0xd9]);
}

/** A HEIC as far as its size: an `ftyp` box, then the `ispe` property under `meta`. */
export function heic(width: number, height: number): Uint8Array {
  const box = (type: string, body: readonly number[]): number[] => {
    const size = 8 + body.length;
    return [
      size >> 24,
      (size >> 16) & 0xff,
      (size >> 8) & 0xff,
      size & 0xff,
      ...new TextEncoder().encode(type),
      ...body,
    ];
  };
  const u32 = (value: number): number[] => [
    value >>> 24,
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
  const ispe = box("ispe", [0, 0, 0, 0, ...u32(width), ...u32(height)]);
  const meta = box("meta", [0, 0, 0, 0, ...box("iprp", box("ipco", ispe))]);
  const ftyp = box("ftyp", [...new TextEncoder().encode("heic"), 0, 0, 0, 0]);
  return new Uint8Array([...ftyp, ...meta]);
}
