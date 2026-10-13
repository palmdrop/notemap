import {
  startArenaServer,
  type ArenaServer,
} from "@notemap/destination-arena/testing";
import { afterEach, describe, expect, it } from "vitest";

const started: ArenaServer[] = [];

afterEach(async () => {
  for (const each of started.splice(0)) await each.close();
});

async function serving(
  options: Parameters<typeof startArenaServer>[0] = {},
): Promise<ArenaServer> {
  const server = await startArenaServer(options);
  started.push(server);
  return server;
}

const asking = (token?: string) => ({
  headers: token === undefined ? {} : { authorization: `Bearer ${token}` },
});

describe("the fake are.na, as a stage runs it", () => {
  it("answers who the token is, and refuses without it", async () => {
    const server = await serving({ token: "stage-token" });
    const at = server.listening;

    expect((await fetch(`${at}/v3/me`, asking("stage-token"))).status).toBe(
      200,
    );
    expect((await fetch(`${at}/v3/me`, asking())).status).toBe(401);
    expect(server.token).toBe("stage-token");
  });

  it("names the address it was given in a presigned upload", async () => {
    const server = await serving({ url: "http://arena:8080/" });
    const at = server.listening;

    const presigned = await fetch(`${at}/v3/uploads/presign`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${server.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        files: [{ filename: "a.png", content_type: "image/png" }],
      }),
    });

    expect(server.url).toBe("http://arena:8080");
    expect(await presigned.json()).toMatchObject({
      files: [
        {
          upload_url: expect.stringMatching(/^http:\/\/arena:8080\/uploads\//),
        },
      ],
    });
  });

  it("shows what landed at /_inspect, without a token", async () => {
    const server = await serving();
    const at = server.listening;

    expect(await (await fetch(`${at}/_inspect`)).json()).toEqual({
      blocks: [],
      uploads: {},
    });

    await fetch(`${at}/v3/blocks`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${server.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ value: "a thought", channel_ids: ["seeded"] }),
    });

    expect(await (await fetch(`${at}/_inspect`)).json()).toEqual({
      blocks: [{ value: "a thought", channel_ids: ["seeded"] }],
      uploads: {},
    });
  });
});
