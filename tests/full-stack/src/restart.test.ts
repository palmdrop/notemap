import { describe, expect, it } from "vitest";

import { daemons, MANUAL } from "./harness/index.ts";

const daemon = daemons();

describe("a daemon told to stop", () => {
  it("exits cleanly, and gives back the same pool when it starts again", async () => {
    const first = await daemon();
    const captured = await first.client.capture({
      channel: MANUAL,
      text: "still here in the morning",
    });
    await first.client.drain();

    expect(await first.stop()).toBe(0);

    const again = await daemon(first.world);
    const { item } = await again.client.item(captured.id);

    expect(item?.id).toBe(captured.id);
    expect(item?.payload.content["text"]).toBe("still here in the morning");
  });
});
