import { render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { json, refusal, routeOf } from "@notemap/client/testing";

import { asked, client, pool, sentUrls } from "$testing/pool";
import Unfurls from "./Unfurls.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

type Answer = Response | Promise<Response>;

async function serving(
  unfurl: boolean | undefined,
  answers: Record<string, () => Answer> = {},
) {
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/settings") {
      return json(200, {
        values: unfurl === undefined ? [] : [{ name: "unfurl", value: unfurl }],
      });
    }
    if (route === "GET /v1/unfurl") {
      const url = new URL(request.url).searchParams.get("url") ?? "";
      return answers[url]?.() ?? json(200, { url, reached: false });
    }
    return json(404, { error: { code: "unknown-route" } });
  });
  if (unfurl !== undefined) await client.settings.load();
}

const unfurls = () => asked().filter((route) => route === "GET /v1/unfurl");

const block = (host: string) =>
  screen.getByText(host).closest("a") as HTMLAnchorElement;

test("draws what a link points at", async () => {
  await serving(true, {
    "https://a.example/post": () =>
      json(200, {
        url: "https://a.example/post",
        reached: true,
        title: "A post",
        description: "What it is about",
        image: "https://img.example/a.png",
        siteName: "A Site",
      }),
  });

  render(Unfurls, { text: "read https://a.example/post" });

  await screen.findByText("A post");
  expect(screen.getByText("What it is about")).toBeDefined();
  expect(screen.getByText("A Site")).toBeDefined();
  const link = screen.getByText("A post").closest("a");
  expect(link?.getAttribute("href")).toBe("https://a.example/post");
  expect(link?.getAttribute("rel")).toBe("noreferrer");
  const image = link?.querySelector("img");
  expect(image?.getAttribute("src")).toBe("https://img.example/a.png");
  expect(image?.getAttribute("referrerpolicy")).toBe("no-referrer");
});

test("says so where the page says nothing about itself", async () => {
  await serving(true, {
    "https://a.example/": () =>
      json(200, { url: "https://a.example/", reached: true }),
  });

  render(Unfurls, { text: "https://a.example/" });

  await screen.findByText("says nothing about itself");
  expect(screen.getByText("a.example")).toBeDefined();
});

test("says so where the page could not be reached", async () => {
  await serving(true);

  render(Unfurls, { text: "https://down.example/" });

  await screen.findByText("out of reach");
});

test("says so where the daemon would not read it", async () => {
  await serving(true, {
    "http://10.0.0.1/": () =>
      refusal(422, "address-refused", { url: "http://10.0.0.1/" }),
  });

  render(Unfurls, { text: "http://10.0.0.1/" });

  await screen.findByText("not read");
});

test("holds the block's place while the answer is in flight, and keeps it after", async () => {
  let settle!: (response: Response) => void;
  const pending = new Promise<Response>((resolve) => {
    settle = resolve;
  });
  await serving(true, { "https://a.example/": () => pending });

  render(Unfurls, { text: "https://a.example/" });

  await vi.waitFor(() => {
    expect(unfurls()).toHaveLength(1);
  });
  const asking = block("a.example");
  expect(asking.dataset["unfurl"]).toBe("asking");
  const reserved = asking.className;

  settle(
    json(200, { url: "https://a.example/", reached: true, title: "Arrived" }),
  );
  await screen.findByText("Arrived");
  const read = block("a.example");
  expect(read.dataset["unfurl"]).toBe("read");
  expect(read.className).toBe(reserved);
});

test("draws one block per link in a note", async () => {
  await serving(true, {
    "https://a.example/": () =>
      json(200, { url: "https://a.example/", reached: true, title: "One" }),
    "https://b.example/": () =>
      json(200, { url: "https://b.example/", reached: true, title: "Two" }),
  });

  render(Unfurls, { text: "https://a.example/ and https://b.example/" });

  await screen.findByText("One");
  await screen.findByText("Two");
  expect(unfurls()).toHaveLength(2);
});

test("asks once for a link named twice, in one note or across two", async () => {
  await serving(true, {
    "https://a.example/": () =>
      json(200, { url: "https://a.example/", reached: true, title: "Once" }),
  });

  render(Unfurls, {
    text: "https://a.example/ then [again](https://a.example/)",
  });
  render(Unfurls, { text: "and elsewhere https://a.example/" });

  await vi.waitFor(() => {
    expect(screen.getAllByText("Once")).toHaveLength(2);
  });
  expect(unfurls()).toHaveLength(1);
  expect(new URL(sentUrls().at(-1) ?? "").searchParams.get("url")).toBe(
    "https://a.example/",
  );
});

test("asks nothing, and draws nothing, while the pool setting is off", async () => {
  await serving(false);

  render(Unfurls, { text: "https://a.example/" });

  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(unfurls()).toEqual([]);
  expect(document.querySelector("[data-unfurl]")).toBeNull();
});

test("asks nothing before the pool setting has been read", async () => {
  await serving(undefined);

  render(Unfurls, { text: "https://a.example/" });

  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(unfurls()).toEqual([]);
  expect(document.querySelector("[data-unfurl]")).toBeNull();
});
