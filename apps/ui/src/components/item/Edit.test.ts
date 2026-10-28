import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import {
  anItem,
  asked,
  json,
  routeOf,
  type MockTransport,
} from "@notemap/client/testing";

import Capture from "$components/capture/Capture.svelte";
import Dropping from "$components/dropping/Dropping.svelte";
import { unsaved } from "$lib/leaving.svelte";
import { notices } from "$lib/notices.svelte";
import { client, heldBlobs, pool } from "$testing/pool";
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

test("draws the picture the item carries, and removing it saves the item without one", async () => {
  const transport = pool(accepting());
  const done = vi.fn();

  render(Edit, { item: pictured("one"), onclose: done });

  expect(screen.getByAltText("shot.png")).toBeDefined();
  expect(screen.getByText("shot.png")).toBeDefined();

  await fireEvent.click(
    screen.getByRole("button", { name: "remove shot.png" }),
  );
  expect(screen.queryByAltText("shot.png")).toBeNull();

  await fireEvent.click(screen.getByRole("button", { name: "save" }));

  // Closes once the operation has been recorded, not before it.
  await vi.waitFor(async () => {
    expect(await edits(transport)).toHaveLength(1);
  });
  expect(done).toHaveBeenCalled();
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

  const paper = await screen.findByText("paper.pdf");
  const [picture] = screen.getAllByAltText("shot.png");
  const field = screen.getByLabelText("What it says");
  // Where the row being edited draws them: the picture above the words, the file under.
  expect(
    picture!.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    field.compareDocumentPosition(paper) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();

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

/** A picked file counts as a change, and the bytes go up before the words. */
test("save attaches what is picked, and the words wait for the bytes", async () => {
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
  // Nothing is held until the save asks for it, which is the whole of the fix.
  await screen.findByText("shot.png");
  expect(heldBlobs()).toEqual([]);

  // The chord asks for the save; the button is working meanwhile.
  await fireEvent.keyDown(screen.getByLabelText("What it says"), {
    key: "Enter",
    metaKey: true,
  });

  await vi.waitFor(() => {
    expect(heldBlobs()).toHaveLength(1);
  });
  expect(await edits(transport)).toHaveLength(0);

  release();
  await vi.waitFor(async () => {
    expect(await edits(transport)).toHaveLength(1);
  });
  const [edit] = await edits(transport);
  expect(edit?.payload.assets).toHaveLength(1);
  expect(closed).toHaveBeenCalled();
  // The operation has left the outbox, and the bytes left with it.
  await vi.waitFor(() => {
    expect(heldBlobs()).toEqual([]);
  });
});

test("holds a picked file and leaves no bytes behind where the edit is never saved", async () => {
  stubObjectUrls();
  const transport = pool(accepting());
  const closed = vi.fn();

  render(Edit, { item: anItem("one"), onclose: closed });

  const picker = screen.getByLabelText("Files to carry");
  await fireEvent.change(picker, {
    target: {
      files: [
        new File(["one"], "first.png", { type: "image/png" }),
        new File(["%PDF"], "paper.pdf", { type: "application/pdf" }),
      ],
    },
  });

  await screen.findByText("paper.pdf");
  // Drawn, and nothing of it written: a picked file is the edit's until it saves.
  expect(heldBlobs()).toEqual([]);

  await fireEvent.click(
    screen.getByRole("button", { name: "remove paper.pdf" }),
  );
  expect(screen.queryByText("paper.pdf")).toBeNull();

  await fireEvent.click(screen.getByRole("button", { name: "revert" }));
  expect(screen.queryByText("first.png")).toBeNull();

  await fireEvent.change(picker, {
    target: { files: [new File(["two"], "second.png", { type: "image/png" })] },
  });
  await screen.findByText("second.png");

  await fireEvent.click(screen.getByRole("button", { name: "close" }));
  const dialog = await screen.findByRole("dialog", { name: "Unsaved changes" });
  await fireEvent.click(within(dialog).getByRole("button", { name: "revert" }));

  expect(closed).toHaveBeenCalled();
  expect(heldBlobs()).toEqual([]);
  expect(await edits(transport)).toHaveLength(0);
  expect(
    asked(transport)
      .map(routeOf)
      .filter((route) => route.startsWith(UPLOAD)),
  ).toEqual([]);
});

test("a file dropped while the edit is open goes to the edit rather than the box, and is saved with it", async () => {
  stubObjectUrls();
  const transport = pool(accepting());

  const box = render(Capture).container;
  render(Dropping);
  const edit = render(Edit, { item: anItem("one"), onclose: () => {} });

  await fireEvent.drop(document.body, {
    dataTransfer: {
      types: ["Files"],
      files: [new File(["one"], "dropped.png", { type: "image/png" })],
    },
  });

  await within(edit.container).findByAltText("dropped.png");
  expect(within(box).queryByAltText("dropped.png")).toBeNull();

  await fireEvent.click(
    within(edit.container).getByRole("button", { name: "save" }),
  );
  await vi.waitFor(async () => {
    expect((await edits(transport))[0]?.payload.assets).toHaveLength(1);
  });
});

test("refuses a file larger than the pool takes as it is picked, in the status line", async () => {
  stubObjectUrls();
  pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/session") {
      return json(200, { authenticated: false, requiresCredentials: false });
    }
    if (route === "GET /v1/assets/limits") return json(200, { maxUpload: 4 });
    return accepting()(request);
  });
  await client.askSession();
  await vi.waitFor(() => {
    expect(client.refuses(new File(["far too many"], "probe"))).toBeDefined();
  });

  render(Edit, { item: anItem("one"), onclose: vi.fn() });
  await fireEvent.change(screen.getByLabelText("Files to carry"), {
    target: { files: [new File(["far too many bytes"], "huge.bin")] },
  });

  await vi.waitFor(() => {
    expect(notices.latest?.what).toContain("huge.bin: that file is larger");
  });
  expect(screen.queryByText("huge.bin")).toBeNull();
});

test("a save whose attach fails lets go of what it held, and keeps the edit open", async () => {
  stubObjectUrls();
  let written = 0;
  const transport = pool(accepting());
  const store = client.attach.bind(client);
  // The second file is the one that cannot be held, so the first is already
  // written when it fails.
  client.attach = async (file: File) => {
    written += 1;
    if (written === 2) throw new Error("no room");
    return store(file);
  };
  const closed = vi.fn();

  render(Edit, { item: anItem("one"), onclose: closed });

  await fireEvent.change(screen.getByLabelText("Files to carry"), {
    target: {
      files: [
        new File(["one"], "first.png", { type: "image/png" }),
        new File(["two"], "second.png", { type: "image/png" }),
      ],
    },
  });
  await screen.findByText("second.png");

  await fireEvent.click(screen.getByRole("button", { name: "save" }));

  await vi.waitFor(() => {
    expect(notices.latest?.what).toContain("second.png: no room");
  });
  // The words are still there to try again with, and nothing was left held.
  expect(closed).not.toHaveBeenCalled();
  expect(screen.getByText("first.png")).toBeDefined();
  expect(heldBlobs()).toEqual([]);
  expect(await edits(transport)).toHaveLength(0);
});

test("a save the pool would now refuse removes the file, says so, and does not save", async () => {
  stubObjectUrls();
  const transport = pool((request) => {
    const route = routeOf(request);
    if (route === "GET /v1/session") {
      return json(200, { authenticated: false, requiresCredentials: false });
    }
    if (route === "GET /v1/assets/limits") return json(200, { maxUpload: 8 });
    return accepting()(request);
  });
  const closed = vi.fn();

  render(Edit, { item: anItem("one"), onclose: closed });
  // Picked before the limit is known, which is the only way into this branch.
  await fireEvent.change(screen.getByLabelText("Files to carry"), {
    target: { files: [new File(["far too many bytes"], "huge.bin")] },
  });
  await screen.findByText("huge.bin");

  await client.askSession();
  await vi.waitFor(() => {
    expect(
      client.refuses(new File(["far too many bytes"], "probe")),
    ).toBeDefined();
  });

  await fireEvent.click(screen.getByRole("button", { name: "save" }));

  await vi.waitFor(() => {
    expect(notices.latest?.what).toContain("huge.bin: that file is larger");
  });
  expect(screen.queryByText("huge.bin")).toBeNull();
  expect(closed).not.toHaveBeenCalled();
  expect(heldBlobs()).toEqual([]);
  expect(await edits(transport)).toHaveLength(0);
});

test("removing a picked file revokes the handle its thumbnail was drawn through", async () => {
  stubObjectUrls();
  pool(accepting());

  render(Edit, { item: anItem("one"), onclose: vi.fn() });

  await fireEvent.change(screen.getByLabelText("Files to carry"), {
    target: { files: [new File(["one"], "shot.png", { type: "image/png" })] },
  });
  await screen.findByText("shot.png");
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1);

  await fireEvent.click(
    screen.getByRole("button", { name: "remove shot.png" }),
  );

  await vi.waitFor(() => {
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:held");
  });
});

/** An attachment the item carries is drawn from a list that is `$state`, so it is compared by asset. */
test("an edit of a capture that carries a file holds nothing the item does not say", async () => {
  pool(accepting());

  render(Edit, { item: pictured("one"), onclose: vi.fn() });
  await screen.findByText("shot.png");

  expect(unsaved()).toBe(false);
  expect(screen.queryByRole("button", { name: "revert" })).toBeNull();
});
