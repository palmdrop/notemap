import { fireEvent, render, screen } from "@testing-library/svelte";
import { expect, test, vi } from "vitest";

import { anItem, json, routeOf } from "@notemap/client/testing";

import Feed from "$components/feed/Feed.svelte";

import { readDraft, writeDraft } from "$lib/draft";
import { client, pool } from "$testing/pool";
import Capture from "./Capture.svelte";

vi.mock("$lib/client", () => import("$testing/pool"));

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
  render(Capture);

  const written = await capture("before any round trip");

  expect(await screen.findByText("before any round trip")).toBeDefined();
  await cleared(written);

  answer();
});

test("takes the caret, so the queue is typed into rather than clicked into", () => {
  pool(() => empty.clone());
  render(Capture);

  expect(document.activeElement).toBe(screen.getByLabelText("What to capture"));
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

  render(Capture);

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

/** jsdom draws nothing, so it implements no handle on a blob's bytes either. */
function stubObjectUrls(): void {
  URL.createObjectURL = vi.fn(() => "blob:held");
  URL.revokeObjectURL = vi.fn();
}

const shot = () => new File(["bytes"], "shot.png", { type: "image/png" });

async function attach(file = shot()) {
  await fireEvent.change(screen.getByLabelText("A picture to capture"), {
    target: { files: [file] },
  });
}

/**
 * A picture goes up with the capture and cannot be taken back once it has, so
 * it is looked at before it is sent rather than recognised afterwards.
 */
test("draws an attached picture before it is committed, and offers a way to drop it", async () => {
  stubObjectUrls();
  pool(() => empty.clone());

  render(Capture);
  await attach();

  const drawn = await screen.findByAltText("What is about to be captured");
  expect(drawn.getAttribute("src")).toBe("blob:held");
  expect(screen.getByText("shot.png")).toBeDefined();

  await fireEvent.click(screen.getByRole("button", { name: "drop" }));

  expect(screen.queryByAltText("What is about to be captured")).toBeNull();
  expect(screen.queryByText("shot.png")).toBeNull();
});

test("a dropped picture is not sent with the capture that follows", async () => {
  stubObjectUrls();
  const sent: Envelope[] = [];
  pool(async (request) => {
    if (routeOf(request) !== "POST /v1/captures") return empty.clone();
    const envelope = (await request.json()) as Envelope;
    sent.push(envelope);
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id),
      matchedOn: "id",
    });
  });

  render(Capture);
  await attach();
  await fireEvent.click(screen.getByRole("button", { name: "drop" }));
  await capture("just words");

  await vi.waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.payload.assets).toEqual([]);
});

/** `⏎` in the field is a new line, which is what prose wants, and so is `⇧⏎`. */
test("commits the capture with mod-enter from the field it is written in", async () => {
  pool(async (request) => {
    if (routeOf(request) !== "POST /v1/captures") return empty.clone();
    const envelope = (await request.json()) as Envelope;
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id),
      matchedOn: "id",
    });
  });

  render(Capture);
  const written = screen.getByLabelText(
    "What to capture",
  ) as HTMLTextAreaElement;
  await fireEvent.input(written, { target: { value: "sent by keystroke" } });

  await fireEvent.keyDown(written, { key: "Enter" });
  await fireEvent.keyDown(written, { key: "Enter", shiftKey: true });
  expect(written.value).toBe("sent by keystroke");

  await fireEvent.keyDown(written, { key: "Enter", ctrlKey: true });
  await cleared(written);
});

/** Classifying is part of writing it down, not a second gesture on the row. */
test("carries the tags chosen in the box on the capture, and clears them with it", async () => {
  const sent: (Envelope & { tags?: string[] })[] = [];
  pool(async (request) => {
    const route = routeOf(request);
    if (route === "GET /v1/tags") {
      return json(200, { values: [{ name: "research", count: 3 }] });
    }
    if (route !== "POST /v1/captures") return empty.clone();
    const envelope = (await request.json()) as Envelope;
    sent.push(envelope);
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id),
      matchedOn: "id",
    });
  });

  render(Capture);

  await fireEvent.click(
    screen.getByRole("button", { name: "Tag the capture" }),
  );
  const line = screen.getByLabelText("Tag the capture");
  await fireEvent.input(line, { target: { value: "research" } });
  await fireEvent.keyDown(line, { key: "Enter" });

  await fireEvent.click(
    screen.getByRole("button", { name: "Tag the capture" }),
  );
  await fireEvent.input(screen.getByLabelText("Tag the capture"), {
    target: { value: "fresh" },
  });
  await fireEvent.keyDown(screen.getByLabelText("Tag the capture"), {
    key: "Enter",
  });

  expect(
    screen.getByRole("button", { name: "research", pressed: true }),
  ).toBeDefined();
  expect(
    screen.getByRole("button", { name: "fresh", pressed: true }),
  ).toBeDefined();

  const written = await capture("a classified thought");

  await vi.waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]?.tags).toEqual(["research", "fresh"]);
  await cleared(written);
  expect(screen.queryByRole("button", { name: "research" })).toBeNull();
  expect(screen.queryByRole("button", { name: "fresh" })).toBeNull();
});

function captured() {
  return pool(async (request) => {
    if (routeOf(request) !== "POST /v1/captures") return empty.clone();
    const envelope = (await request.json()) as Envelope;
    return json(201, {
      kind: "captured",
      item: anItem(envelope.id),
      matchedOn: "id",
    });
  });
}

/**
 * A crash or a closed tab should not cost what was typed before `capture`, so
 * the box keeps a draft and starts from it. The picture is not part of it.
 */
test("starts from the draft it last held, words and tags both", () => {
  captured();
  writeDraft({ text: "half a thought", tags: ["research"] });

  render(Capture);

  expect(
    (screen.getByLabelText("What to capture") as HTMLTextAreaElement).value,
  ).toBe("half a thought");
  expect(
    screen.getByRole("button", { name: "research", pressed: true }),
  ).toBeDefined();
});

test("keeps what is typed and tagged as it goes, and lets go when the capture commits", async () => {
  captured();
  render(Capture);

  await fireEvent.click(
    screen.getByRole("button", { name: "Tag the capture" }),
  );
  await fireEvent.input(screen.getByLabelText("Tag the capture"), {
    target: { value: "research" },
  });
  await fireEvent.keyDown(screen.getByLabelText("Tag the capture"), {
    key: "Enter",
  });
  const written = screen.getByLabelText("What to capture");
  await fireEvent.input(written, { target: { value: "half a thought" } });

  await vi.waitFor(() => {
    expect(readDraft()).toEqual({ text: "half a thought", tags: ["research"] });
  });

  await fireEvent.click(screen.getByRole("button", { name: "capture" }));
  await cleared(written as HTMLTextAreaElement);

  expect(readDraft()).toEqual({ text: "", tags: [] });
});

test("keeps the draft where the capture fails", async () => {
  captured();
  vi.spyOn(client, "capture").mockRejectedValue(new Error("not this time"));
  render(Capture);

  const written = await capture("not lost");

  expect(await screen.findByRole("status")).toBeDefined();
  expect(written.value).toBe("not lost");
  expect(readDraft()).toEqual({ text: "not lost", tags: [] });
});

/** The box unmounts with the queue, and a picture picked for it should not go with it. */
test("keeps a picked picture across the box being drawn again, until the capture commits", async () => {
  stubObjectUrls();
  captured();

  const first = render(Capture);
  await attach();
  expect(await screen.findByText("shot.png")).toBeDefined();
  first.unmount();

  const second = render(Capture);
  expect(await screen.findByText("shot.png")).toBeDefined();
  await capture("with the picture");
  await vi.waitFor(() => {
    expect(screen.queryByText("shot.png")).toBeNull();
  });
  second.unmount();

  render(Capture);
  expect(screen.queryByText("shot.png")).toBeNull();
});
