import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const read = (name: string) =>
  readFileSync(
    fileURLToPath(new URL(`../../../docker/compose/${name}`, import.meta.url)),
    "utf8",
  );

/**
 * Not the daemon's behaviour, but the thing that decides who can reach it —
 * and `4747:4747` in place of the loopback publish is a one-character mistake
 * that would put the pool on the LAN behind one password.
 */
describe("the compose file for one machine", () => {
  const file = read("compose.yaml");

  it("publishes on the host's loopback and nowhere else", () => {
    const published = [...file.matchAll(/^\s*-\s*"([^"]*:\d+)"/gm)].map(
      (found) => found[1],
    );

    expect(published).toEqual(["127.0.0.1:4747:4747"]);
  });
});

describe("the compose file for a proxy", () => {
  const file = read("compose.proxy.yaml");

  it("publishes no port at all", () => {
    expect(file).not.toMatch(/^\s*ports:/m);
  });

  it("names the network it joins rather than defaulting to one", () => {
    expect(file).toMatch(/external:\s*true/);
    expect(file).toMatch(/\$\{PROXY_NETWORK:\?/);
  });
});

describe("the config the container reads", () => {
  it("binds every interface, in the file rather than in the image", () => {
    expect(read("config.toml")).toMatch(/host\s*=\s*"0\.0\.0\.0"/);
  });
});
