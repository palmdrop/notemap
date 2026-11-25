import { flushSync } from "svelte";
import { expect, test } from "vitest";

import { lasting } from "./lasting.svelte";

test("keeps the last value through a moment it reads as missing, and follows a new one", () => {
  let id = $state<string | undefined>("one");
  const cleanup = $effect.root(() => {
    const kept = lasting(() => id);
    const seen: (string | undefined)[] = [];
    $effect(() => {
      seen.push(kept.current);
    });

    flushSync();
    id = undefined;
    flushSync();
    id = "two";
    flushSync();

    expect(seen).toEqual(["one", "two"]);
  });
  cleanup();
});
