/**
 * What a delivery sent, as read, until the page ends or the session does — or that it kept
 * nothing, as `null`. Neither ever changes, so a record read once is drawn at
 * once the next time rather than changing height under the reader when its
 * second read lands.
 */
const held = new Map<string, string | null>();

export function outputOf(record: string): string | null | undefined {
  return held.get(record);
}

export function keepOutput(record: string, text: string | null): void {
  held.set(record, text);
}

export function forgetOutputs(): void {
  held.clear();
}
