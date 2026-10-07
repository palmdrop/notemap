import { render, screen } from "@testing-library/svelte";
import { expect, test } from "vitest";

import { anItem, json } from "@notemap/client/testing";

import { pool } from "$testing/pool";
import Payload from "./Payload.svelte";

function carrying(...files: readonly [name: string, mime: string][]) {
  return anItem("one", {
    payload: {
      type: "note",
      content: {},
      metadata: {},
      assets: files.map((_, at) => ({
        slot: String(at).padStart(3, "0"),
        asset: `asset-${String(at)}`,
      })),
    },
    assets: files.map(([filename, mime], at) => ({
      id: `asset-${String(at)}`,
      filename,
      mime,
      blob: "b",
      bytes: 517190,
    })),
  });
}

test("draws a PDF as a line to download, not as a payload type nobody draws", () => {
  pool(() => json(200, {}));

  render(Payload, {
    item: carrying(["incandescent-alphabets.pdf", "application/pdf"]),
  });

  const link = screen.getByRole("link", {
    name: "incandescent-alphabets.pdf",
  });
  expect(link.getAttribute("href")).toContain("/v1/assets/asset-0/content");
  expect(link.getAttribute("download")).toBe("incandescent-alphabets.pdf");
  expect(link.classList.contains("font-semibold")).toBe(true);
  expect(screen.getByText("517 KB")).toBeDefined();
  expect(screen.queryByText("application/pdf")).toBeNull();
  expect(screen.queryByText("note")).toBeNull();
});

test("sets the lines off under the words with a short rule, and draws none with no words above", () => {
  pool(() => json(200, {}));
  const paper = carrying(["paper.pdf", "application/pdf"]);

  const bare = render(Payload, { item: paper });
  expect(bare.container.querySelector("[data-rule]")).toBeNull();
  bare.unmount();

  const { container } = render(Payload, {
    item: anItem("one", {
      ...paper,
      payload: { ...paper.payload, content: { text: "the words" } },
    }),
  });

  const words = screen.getByText("the words");
  const rule = container.querySelector("[data-rule]");
  const line = screen.getByRole("link", { name: "paper.pdf" });
  expect(rule).not.toBeNull();
  expect(
    words.compareDocumentPosition(rule!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    rule!.compareDocumentPosition(line) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("draws the first two pictures, and every attachment after them as a line", () => {
  pool(() => json(200, {}));

  const { container } = render(Payload, {
    item: carrying(
      ["one.png", "image/png"],
      ["paper.pdf", "application/pdf"],
      ["two.png", "image/png"],
      ["three.png", "image/png"],
    ),
  });

  const pictures = [...container.querySelectorAll("img")].map((image) =>
    image.getAttribute("src"),
  );
  expect(pictures).toHaveLength(2);
  expect(pictures[0]).toContain("asset-0");
  expect(pictures[1]).toContain("asset-2");
  expect(screen.getAllByRole("link").map((link) => link.textContent)).toEqual([
    "paper.pdf",
    "three.png",
  ]);
});

test("cuts a long name in the middle, keeping its end, and says it whole on hover", () => {
  pool(() => json(200, {}));
  const long = "annie-g.-rogers-incandescent-alphabets-karnac-books-2016-.pdf";

  render(Payload, { item: carrying([long, "application/pdf"]) });

  const link = screen.getByRole("link", { name: long });
  expect(link.getAttribute("title")).toBe(long);
  const [head, end] = [...link.children];
  expect(head?.classList.contains("truncate")).toBe(true);
  expect(end?.textContent).toBe("ks-2016-.pdf");
  expect(end?.classList.contains("shrink-0")).toBe(true);
});
