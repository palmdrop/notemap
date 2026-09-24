import { expect, test } from "vitest";

import { links, rendered } from "./markdown";

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

test("links a bare URL in prose", () => {
  const html = drawn("see https://example.org/page for more");

  const link = html.querySelector("a[href]");
  expect(link?.getAttribute("href")).toBe("https://example.org/page");
  expect(link?.textContent).toBe("https://example.org/page");
  expect(link?.getAttribute("rel")).toBe("noreferrer");
});

test("links a bare www address, with a scheme", () => {
  const html = drawn("see www.example.org today");

  expect(html.querySelector("a[href]")?.getAttribute("href")).toBe(
    "http://www.example.org",
  );
});

test("does not link a URL in a code span or a fenced block", () => {
  const html = drawn(
    "`https://example.org/span`\n\n```\nhttps://example.org/fence\n```",
  );

  expect(html.querySelector("a")).toBeNull();
  expect(html.textContent).toContain("https://example.org/span");
  expect(html.textContent).toContain("https://example.org/fence");
});

test("keeps trailing punctuation outside a bare link", () => {
  const html = drawn("go to https://example.org/page.");

  expect(html.querySelector("a[href]")?.getAttribute("href")).toBe(
    "https://example.org/page",
  );
  expect(html.textContent).toBe("go to https://example.org/page.");
});

test("leaves a written link as it was", () => {
  const html = drawn("[a page](https://example.org/page)");

  const links = html.querySelectorAll("a");
  expect(links).toHaveLength(1);
  expect(links[0]?.textContent).toBe("a page");
  expect(links[0]?.getAttribute("href")).toBe("https://example.org/page");
});

test("leaves a bare email address as text with nowhere to go", () => {
  const html = drawn("write to someone@example.org");

  expect(html.querySelector("a[href]")).toBeNull();
  expect(html.textContent).toBe("write to someone@example.org");
});

test("lists the links a reader could follow, each once", () => {
  expect(
    links(
      "see https://a.example/one and [again](https://a.example/one), then www.b.example, `https://c.example` and [no](javascript:alert(1))",
    ),
  ).toEqual(["https://a.example/one", "http://www.b.example"]);
});
