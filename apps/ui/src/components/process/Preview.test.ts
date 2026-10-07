import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import type { Attachment } from "@notemap/client";

import Preview from "./Preview.svelte";

const one = (asset: string, filename: string, mime: string): Attachment => ({
  asset,
  url: `pool:${asset}`,
  filename,
  mime,
  bytes: 2048,
});

test("draws the capture's attachments as a delivered record does: two pictures above, every other file under", () => {
  const { container } = render(Preview, {
    shown: {
      kind: "previewed",
      content: {
        mediaType: "text/markdown",
        text: "what would be written",
        truncated: false,
      },
    },
    attachments: [
      one("a", "one.png", "image/png"),
      one("b", "two.png", "image/png"),
      one("c", "three.png", "image/png"),
      one("d", "paper.pdf", "application/pdf"),
    ],
  });

  const pictures = [...container.querySelectorAll("img")].map((image) =>
    image.getAttribute("src"),
  );
  expect(pictures).toEqual(["pool:a", "pool:b"]);
  expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
    "three.png",
    "paper.pdf",
  ]);
  expect(container.querySelector("[data-rule]")).not.toBeNull();
});
