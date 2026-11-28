import { expect, test, vi } from "vitest";

import { modality } from "./modality.svelte";

test("says the keys are in use after a key, and not after the pointer", () => {
  expect(modality.keys).toBe(false);

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "j" }));
  expect(modality.keys).toBe(true);

  window.dispatchEvent(new Event("pointerdown"));
  expect(modality.keys).toBe(false);
});

test("has seen a key pressed before anything asked", async () => {
  vi.resetModules();
  const fresh = await import("./modality.svelte");

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "f" }));

  expect(fresh.modality.keys).toBe(true);
});
