import { describe, expect, it } from "vitest";

import { extract } from "./extract";

const BASE = new URL("https://example.org/posts/one");

describe("extract", () => {
  it("reads all four Open Graph properties", () => {
    const html = `<html><head>
      <meta property="og:title" content="A title">
      <meta content="What it is about" property="og:description" />
      <meta property='og:image' content='https://cdn.example.org/a.jpg'>
      <meta property="og:site_name" content="Example">
      <title>Not this</title>
    </head><body></body></html>`;

    expect(extract(html, BASE)).toEqual({
      title: "A title",
      description: "What it is about",
      image: "https://cdn.example.org/a.jpg",
      siteName: "Example",
    });
  });

  it("falls back to the document's title", () => {
    expect(
      extract("<head><title> Just  a\n title </title></head>", BASE),
    ).toEqual({ title: "Just a title" });
  });

  it("answers nothing where the page says nothing", () => {
    expect(extract("<html><body>hi</body></html>", BASE)).toEqual({});
  });

  it("makes a relative image absolute against the page", () => {
    const html = `<meta property="og:image" content="/img/a.png">`;
    expect(extract(html, BASE).image).toBe("https://example.org/img/a.png");
  });

  it("drops an image that is not http or https", () => {
    const html = `<meta property="og:image" content="javascript:alert(1)">`;
    expect(extract(html, BASE).image).toBeUndefined();
  });

  it("decodes entities", () => {
    const html = `<meta property="og:title" content="Tom &amp; Jerry &#8212; &#x2014; &mdash; &rsquo;s">`;
    expect(extract(html, BASE).title).toBe("Tom & Jerry — — — ’s");
  });

  it("reads only the head", () => {
    const html = `<head></head><body><meta property="og:title" content="late"><title>late</title></body>`;
    expect(extract(html, BASE)).toEqual({});
  });

  it("keeps the first of a repeated property", () => {
    const html = `<meta property="og:image" content="https://a.example/1.png"><meta property="og:image" content="https://a.example/2.png">`;
    expect(extract(html, BASE).image).toBe("https://a.example/1.png");
  });

  it("cuts a long description short", () => {
    const html = `<meta property="og:description" content="${"word ".repeat(400)}">`;
    const description = extract(html, BASE).description ?? "";
    expect(description.length).toBeLessThanOrEqual(600);
    expect(description.endsWith("…")).toBe(true);
  });
});
