import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import {
  anItem,
  asked,
  json,
  routeOf,
  type MockTransport,
} from "@notemap/client/testing";

import { pool } from "$testing/pool";
import Edit from "./Edit.fixture.svelte";

type Envelope = {
  source: string;
  payload: { assets: readonly { slot: string; asset: string }[] };
};

const UPLOAD = "PUT /v1/assets/";

/** jsdom draws nothing, so it implements no handle on a blob's bytes either. */
function stubObjectUrls(): void {
  URL.createObjectURL = vi.fn(() => "blob:held");
  URL.revokeObjectURL = vi.fn();
}

function pictured(id: string) {
  return anItem(id, {
    payload: {
      type: "note",
      content: { text: "words" },
      metadata: {},
      assets: [{ slot: "image", asset: "asset-p" }],
    },
    assets: [
      {
        id: "asset-p",
        filename: "shot.png",
        mime: "image/png",
        blob: "b",
        bytes: 4,
      },
    ],
  });
}

/** Every edit lands, whatever it carried. */
function accepting(): (request: Request) => Promise<Response> | Response {
  return (request) => {
    const route = routeOf(request);
    if (route.startsWith(UPLOAD))
      return json(201, { id: route.slice(UPLOAD.length) });
    if (route.endsWith("/edit")) {
      return json(200, { kind: "amended", item: anItem("one") });
    }
    return json(200, { values: [] });
  };
}

/** The edit envelopes sent, the upload beside them being bytes rather than JSON. */
function edits(transport: MockTransport): Promise<Envelope[]> {
  return Promise.all(
    asked(transport)
      .filter((request) => routeOf(request).endsWith("/edit"))
      .map((request) => request.clone().json() as Promise<Envelope>),
  );
}

test("draws the picture the item carries, and dropping it saves the item without one", async () => {
  const transport = pool(accepting());
  const done = vi.fn();

  render(Edit, { item: pictured("one"), onclose: done });

  expect(screen.getByAltText("What it carries")).toBeDefined();
  expect(screen.getByText("shot.png")).toBeDefined();

  await fireEvent.click(
    screen.getByRole("button", { name: "remove shot.png" }),
  );
  expect(screen.queryByAltText("What it carries")).toBeNull();

  await fireEvent.click(screen.getByRole("button", { name: "save" }));
  expect(done).toHaveBeenCalled();

  await vi.waitFor(async () => {
    expect(await edits(transport)).toHaveLength(1);
  });
  const [edit] = await edits(transport);
  expect(edit?.payload.assets).toEqual([]);
  expect(edit?.source).toBe("web");
});

test("attaching adds after what the item carries, and the edit names every slot afresh", async () => {
  stubObjectUrls();
  const uploaded: string[] = [];
  const transport = pool((request) => {
    const route = routeOf(request);
    if (route.startsWith(UPLOAD)) uploaded.push(route.slice(UPLOAD.length));
    return accepting()(request);
  });

  render(Edit, { item: pictured("one"), onclose: vi.fn() });

  await fireEvent.change(screen.getByLabelText("Files to carry"), {
    target: {
      files: [new File(["%PDF"], "paper.pdf", { type: "application/pdf" })],
    },
  });

  expect(await screen.findByText("paper.pdf")).toBeDefined();
  expect(screen.getAllByAltText("What it carries")).toHaveLength(1);

  await fireEvent.click(screen.getByRole("button", { name: "save" }));

  await vi.waitFor(async () => {
    expect(await edits(transport)).toHaveLength(1);
  });
  const [edit] = await edits(transport);
  expect(uploaded).toHaveLength(1);
  expect(edit?.payload.assets).toEqual([
    { slot: "000", asset: "asset-p" },
    { slot: "001", asset: uploaded[0] },
  ]);
  expect(edit?.source).toBe("web");
});

/** An attachment on its way counts as a change, and `save` waits for it to go with the words. */
test("save waits for an attachment still being attached", async () => {
  stubObjectUrls();
  let release!: () => void;
  const held = new Promise<void>((resolve) => (release = resolve));
  const transport = pool(async (request) => {
    if (routeOf(request).startsWith(UPLOAD)) await held;
    return accepting()(request);
  });
  const closed = vi.fn();

  render(Edit, { item: anItem("one"), onclose: closed });

  await fireEvent.change(screen.getByLabelText("Files to carry"), {
    target: {
      files: [new File(["bytes"], "shot.png", { type: "image/png" })],
    },
  });
  // The button is working meanwhile; the chord still asks for a save.
  await fireEvent.keyDown(screen.getByLabelText("What it says"), {
    key: "Enter",
    metaKey: true,
  });
  expect(await edits(transport)).toHaveLength(0);

  release();
  await vi.waitFor(async () => {
    expect(await edits(transport)).toHaveLength(1);
  });
  const [edit] = await edits(transport);
  expect(edit?.payload.assets).toHaveLength(1);
  expect(closed).toHaveBeenCalled();
});
