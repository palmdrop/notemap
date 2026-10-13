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

/**
 * A stage runs code from any branch, so what it publishes and what that code
 * can reach are the two things worth a test. `agent stage` refuses a breach of
 * the second as well; this catches it before anyone runs one.
 */
describe("the compose file for a stage", () => {
  const file = readFileSync(
    fileURLToPath(
      new URL("../../../.claude/stage/compose.yaml", import.meta.url),
    ),
    "utf8",
  );

  /** Each service's own lines, by name. Enough of YAML for a file this repo writes. */
  const services = (() => {
    const body = file.slice(file.indexOf("\nservices:\n"));
    const found = new Map<string, string>();
    for (const block of body.split(/\n(?= {2}[a-z][\w-]*:\n)/).slice(1)) {
      const name = /^ {2}([a-z][\w-]*):/.exec(block)?.[1];
      if (name !== undefined) found.set(name, block);
    }
    return found;
  })();

  const networksOf = (block: string) =>
    /^ {4}networks: \[([^\]]*)\]/m
      .exec(block)?.[1]
      ?.split(",")
      .map((each) => each.trim());

  it("publishes on the host's loopback and nowhere else", () => {
    const published = [...file.matchAll(/^\s*-\s*"([^"]+)"\s*$/gm)].map(
      (found) => found[1],
    );

    expect(published).not.toEqual([]);
    for (const each of published) expect(each).toMatch(/^127\.0\.0\.1:/);
  });

  it("publishes from edge alone", () => {
    const publishing = [...services]
      .filter(([, block]) => /^ {4}ports:/m.test(block))
      .map(([name]) => name);

    expect(publishing).toEqual(["edge"]);
  });

  it("puts every service but edge on the internal network alone", () => {
    expect(file).toMatch(/^ {2}stack:\n {4}internal: true$/m);
    expect([...services.keys()]).toContain("notemap");

    for (const [name, block] of services) {
      expect(networksOf(block), name).toEqual(
        name === "edge" ? ["stack", "default"] : ["stack"],
      );
    }
  });
});
