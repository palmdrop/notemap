/** `crypto.randomUUID()` is v4; this is v7, so ids sort by mint time. */
export function uuidv7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const millis = Date.now();

  for (let index = 0; index < 6; index += 1) {
    bytes[index] = Number((BigInt(millis) >> BigInt(8 * (5 - index))) & 0xffn);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}
