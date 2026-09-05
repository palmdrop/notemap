import { describe, expect, it } from "vitest";

import { envelopeFor, optimisticItem } from "./envelope";

const input = { channel: "web-manual", text: "a thought" };

describe("the envelope a capture is sent as", () => {
  it("carries the offset the browser was in, so the day survives the drain", () => {
    const envelope = envelopeFor(
      input,
      "item-1",
      "2026-09-05T21:30:00.000Z",
      120,
    );

    expect(envelope.utcOffset).toBe(120);
    expect(optimisticItem(envelope).utcOffset).toBe(120);
  });

  it("carries none where nothing knew one", () => {
    const envelope = envelopeFor(input, "item-1", "2026-09-05T21:30:00.000Z");

    expect(envelope.utcOffset).toBeUndefined();
    expect(optimisticItem(envelope).utcOffset).toBeUndefined();
  });

  it("keeps a zero, which is a fact and not an absence", () => {
    const envelope = envelopeFor(
      input,
      "item-1",
      "2026-09-05T21:30:00.000Z",
      0,
    );

    expect(envelope.utcOffset).toBe(0);
  });
});
