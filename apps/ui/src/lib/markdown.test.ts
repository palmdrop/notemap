import { expect, test } from "vitest";

import { rendered } from "./markdown";

function drawn(text: string): HTMLElement {
  const holder = document.createElement("div");
  holder.innerHTML = rendered(text);
  return holder;
}

test("renders CommonMark: a heading, emphasis, a list", () => {
  const html = drawn("# a heading\n\nand *stars* kept\n\n- one\n- two");

  expect(html.querySelector("h1")?.textContent).toBe("a heading");
  expect(html.querySelector("em")?.textContent).toBe("stars");
  expect([...html.querySelectorAll("li")].map((li) => li.textContent)).toEqual([
    "one",
    "two",
  ]);
});

test("escapes raw HTML rather than rendering it", () => {
  const html = drawn("<script>alert(1)</script> and <b>bold</b>");

  expect(html.querySelector("script")).toBeNull();
  expect(html.querySelector("b")).toBeNull();
  expect(html.textContent).toContain("<b>bold</b>");
});

test("follows only http and https", () => {
  const html = drawn(
    "[safe](https://example.org) [plain](http://example.org) [script](javascript:alert(1)) [mail](mailto:a@b.c) [here](/items/one)",
  );

  const hrefs = [...html.querySelectorAll("a")].map((a) => [
    a.textContent,
    a.getAttribute("href"),
  ]);
  expect(hrefs).toEqual([
    ["safe", "https://example.org"],
    ["plain", "http://example.org"],
    ["script", null],
    ["mail", null],
    ["here", null],
  ]);
  expect(html.querySelector("a[href]")?.getAttribute("rel")).toBe("noreferrer");
});
