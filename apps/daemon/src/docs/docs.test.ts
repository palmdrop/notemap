import { afterEach, beforeAll, describe, expect, it } from "vitest";

import { vendorSwaggerUi } from "../../scripts/vendor-swagger.ts";
import { daemon, type Daemon } from "../testing/fixture";

const open: Daemon[] = [];

function started(): Daemon {
  const it = daemon();
  open.push(it);
  return it;
}

beforeAll(() => {
  vendorSwaggerUi();
});

afterEach(async () => {
  await Promise.all(open.splice(0).map((it) => it.cleanup()));
});

describe("the playground", () => {
  it("serves a page that reads the document the daemon itself serves", async () => {
    const { app } = started();

    const response = await app.request("/docs");
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("/v1/openapi.json");
  });

  it("serves every asset the page asks for, from the daemon itself", async () => {
    const { app } = started();

    const page = await (await app.request("/docs")).text();
    const asked = [...page.matchAll(/(?:src|href)="(\/docs\/[^"]+)"/g)].map(
      (match) => match[1] as string,
    );

    expect(asked.length).toBeGreaterThan(0);
    for (const path of asked) {
      expect((await app.request(path)).status, path).toBe(200);
    }
  });

  it("types the assets so a browser will execute them", async () => {
    const { app } = started();

    const script = await app.request("/docs/swagger-ui-bundle.js");
    const style = await app.request("/docs/swagger-ui.css");

    expect(script.headers.get("content-type")).toContain("text/javascript");
    expect(style.headers.get("content-type")).toContain("text/css");
  });

  it("reaches no third party: the page loads nothing off-origin", async () => {
    const { app } = started();

    const page = await (await app.request("/docs")).text();
    const style = await (await app.request("/docs/swagger-ui.css")).text();

    expect(page).not.toMatch(/(?:src|href)="https?:/);
    // The stylesheet's only absolute URLs are SVG namespaces in data URIs.
    expect(style).not.toMatch(/url\(\s*['"]?https?:/);
  });

  it("serves nothing but the named assets, whatever the path asks for", async () => {
    const { app } = started();

    for (const path of [
      "/docs/swagger-ui-standalone-preset.js",
      "/docs/package.json",
      "/docs/..%2Fdocs.html",
    ]) {
      const response = await app.request(path);
      const body = (await response.json()) as { error: { code: string } };

      expect(response.status, path).toBe(404);
      expect(body.error.code, path).toBe("unknown-route");
    }
  });

  it("is not part of the /v1 contract", async () => {
    const { app } = started();

    const document = (await (await app.request("/v1/openapi.json")).json()) as {
      paths: Record<string, unknown>;
    };

    expect(Object.keys(document.paths)).not.toContain("/docs");
  });
});
