import { afterEach, describe, expect, it } from "vitest";

import { DESCRIPTION, startPageServer, TITLE, type PageServer } from "./server";

const started: PageServer[] = [];

afterEach(async () => {
  for (const each of started.splice(0)) await each.close();
});

async function serving(image?: string): Promise<PageServer> {
  const server = await startPageServer(image === undefined ? {} : { image });
  started.push(server);
  return server;
}

describe("the page server", () => {
  it("answers every path with the same page", async () => {
    const server = await serving();

    for (const path of ["/", "/8", "/a/deep/path?q=1"]) {
      const response = await fetch(`${server.url}${path}`);
      expect(response.status).toBe(200);
      const page = await response.text();
      expect(page).toContain(`<meta property="og:title" content="${TITLE}">`);
      expect(page).toContain(
        `<meta property="og:description" content="${DESCRIPTION}">`,
      );
    }
  });

  it("serves the image its page names", async () => {
    const server = await serving();

    const page = await (await fetch(`${server.url}/anything`)).text();
    const image = /og:image" content="([^"]+)"/.exec(page)?.[1];
    const response = await fetch(new URL(image ?? "", server.url));

    expect(response.headers.get("content-type")).toBe("image/png");
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  it("names the image where it was told a browser reaches it", async () => {
    const server = await serving("http://stage.test/_stage/placeholder.png");

    const page = await (await fetch(server.url)).text();
    expect(page).toContain(
      'og:image" content="http://stage.test/_stage/placeholder.png"',
    );
    const proxied = await fetch(`${server.url}/_stage/placeholder.png`);
    expect(proxied.headers.get("content-type")).toBe("image/png");
  });
});
