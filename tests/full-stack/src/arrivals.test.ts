import {
  createClient,
  createFetchTransport,
  createMemoryStore,
  type ActionsSince,
} from "@notemap/client";
import { describe, expect, it } from "vitest";

import { daemons, read, until, WEB } from "./harness/index.ts";

const daemon = daemons();

describe("a capture made elsewhere", () => {
  it("reaches a watching client's feed, said as arrived", async () => {
    const running = await daemon();
    const here = running.client;
    const elsewhere = createClient({
      transport: createFetchTransport(running.url),
      store: createMemoryStore(),
    });

    try {
      // Something in the log for the watcher's first read to take as its mark.
      const before = await elsewhere.capture({
        channel: WEB,
        text: "before anyone looked",
      });
      await elsewhere.drain();

      await here.enter("feed");
      const heard: ActionsSince[] = [];
      const watching = here.actions
        .watch()
        .subscribe((since) => void heard.push(since));

      // Heard at all, the mark is taken, and what comes next is news. A tag
      // the first read already took as its mark says nothing, so another.
      let marks = 0;
      await until("the watcher's first report", async () => {
        if (heard.length > 0) return true;
        await elsewhere.tag(before.id, `kind/mark-${String(marks++)}`);
        await elsewhere.drain();
        here.actions.ask();
        return undefined;
      });

      const captured = await elsewhere.capture({
        channel: WEB,
        text: "from the other device",
      });
      await elsewhere.drain();

      await until("the capture on this client's feed", async () => {
        here.actions.ask();
        return read(here.feed).items[0]?.id === captured.id ? true : undefined;
      });
      expect(heard.flatMap((since) => since.arrived)).toContain(captured.id);

      watching.unsubscribe();
    } finally {
      elsewhere.close();
    }
  });
});
