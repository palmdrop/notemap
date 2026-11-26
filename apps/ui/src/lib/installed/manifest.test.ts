import { expect, it } from "vitest";

import { SHARED_TO } from "$lib/worker/answer";

import written from "../../../static/manifest.webmanifest?raw";

const manifest = JSON.parse(written) as {
  shortcuts?: { name: string; url: string }[];
};

it("offers a shortcut straight to the capture page", () => {
  expect(manifest.shortcuts).toContainEqual(
    expect.objectContaining({ name: "Capture", url: SHARED_TO }),
  );
});
