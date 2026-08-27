import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import Feed from "$components/feed/Feed.svelte";

import { pool } from "$testing/pool";
import CaptureRow from "./CaptureRow.svelte";

vi.mock("$lib/client", () => import("../../testing/pool"));

type Envelope = {
  id: string;
  source: string;
  payload: { assets: readonly { slot: string; asset: string }[] };
};

const UPLOAD = "PUT /v1/assets/";

const empty = json(200, { values: [] });

async function capture(text: string) {
  const written = screen.getByLabelText("What to capture");
  await fireEvent.input(written, { target: { value: text } });
  await fireEvent.click(screen.getByRole("button", { name: "capture" }));
  return written as HTMLTextAreaElement;
}

/** The row clears when the capture is applied, which is before the pool answers. */
async function cleared(written: HTMLTextAreaElement): Promise<void> {
  await vi.waitFor(() => {
    expect(written.value).toBe("");
  });
}

test("draws a capture before the pool answers, and clears the form", async () => {
  let answer = () => {};
  const held = new Promise<void>((resolve) => {
    answer = resolve;
  });

  pool(async (request) => {
    if (routeOf(request) !== "POST /v1/captures") return empty.clone();

    await held;
    const envelope = (await request.json()) as Envelope;
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id, { source: envelope.source }),
      matchedOn: "id",
    });
  });

  render(Feed);
  render(CaptureRow);

  const written = await capture("before any round trip");

  expect(await screen.findByText("before any round trip")).toBeDefined();
  await cleared(written);

  answer();
});

test("stamps a typed note and a picture with different channels", async () => {
  const stamped: string[] = [];
  const named: string[] = [];
  let minted = "";

  pool(async (request) => {
    const route = routeOf(request);
    if (route.startsWith(UPLOAD)) {
      minted = route.slice(UPLOAD.length);
      return json(201, { id: minted });
    }
    if (route !== "POST /v1/captures") return empty.clone();

    const envelope = (await request.json()) as Envelope;
    stamped.push(envelope.source);
    named.push(...envelope.payload.assets.map((each) => each.asset));
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id, { source: envelope.source }),
      matchedOn: "id",
    });
  });

  render(CaptureRow);

  await cleared(await capture("a typed note"));

  const picker = screen.getByLabelText("A picture to capture");
  await fireEvent.change(picker, {
    target: { files: [new File(["bytes"], "shot.png", { type: "image/png" })] },
  });
  await capture("a picture");

  await vi.waitFor(() => {
    expect(stamped).toEqual(["web-manual", "web-image"]);
  });

  // The capture names the asset the upload actually went up under.
  expect(named).toEqual([minted]);
  expect(minted).not.toBe("");
});
