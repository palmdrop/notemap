import { expect, test } from "vitest";

import { modality } from "./modality.svelte";

test("says the keys are in use after a key, and not after the pointer", () => {
  expect(modality.keys).toBe(false);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
  expect(modality.keys).toBe(true);

  window.dispatchEvent(new Event("pointerdown"));
  expect(modality.keys).toBe(false);
});
