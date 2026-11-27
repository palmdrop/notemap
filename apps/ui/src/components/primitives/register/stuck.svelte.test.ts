import { expect, test, vi } from "vitest";

import { watch } from "./stuck.svelte";

test("a heading being drawn is not measured until the frame that measures them all", async () => {
  const styles = vi.spyOn(window, "getComputedStyle");
  const headings = [0, 1, 2].map(() =>
    document.body.appendChild(document.createElement("div")),
  );

  const stops = headings.map((node) => watch(node, () => undefined));
  expect(styles).not.toHaveBeenCalled();

  await new Promise((frame) => requestAnimationFrame(frame));
  expect(styles).toHaveBeenCalledTimes(headings.length);

  for (const stop of stops) stop();
  styles.mockRestore();
});
