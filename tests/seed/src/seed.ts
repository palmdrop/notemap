import { httpAt, HttpFailure, type Http } from "./http.ts";
import type {
  CaptureOutcome,
  DestinationDescription,
  Destinations,
  RoutingRecords,
} from "./types.ts";

export type SeedOptions = {
  readonly source?: string;
  readonly imageSource?: string;
  readonly payloadType?: string;
  readonly imageSlot?: string;
  readonly capability?: string;
  /** The folder, under a destination's root, a routed item is sent to. */
  readonly directory?: string;
  /** Shifts every id and time, so a second seeding adds instead of matching. */
  readonly offset?: number;
  readonly fetch?: typeof globalThis.fetch;
};

/** What was seeded, by the state it was left in. */
export type Seeded = {
  readonly queued: readonly string[];
  readonly processed: readonly string[];
  readonly archived: readonly string[];
  readonly withImage: { readonly item: string; readonly asset: string };
  readonly routed: readonly {
    readonly item: string;
    readonly destination: string;
  }[];
};

type Payload = {
  readonly type: string;
  readonly content: Record<string, unknown>;
  readonly assets?: readonly { slot: string; asset: string }[];
};

const SAID = [
  "the reading list is a graveyard, not a plan",
  "check whether the sweeper races a capture that names the asset",
  "buy the good coffee, the cheap one is a false economy",
  "a note nobody processes is a note nobody wrote",
  "ask about the lease renewal before the end of the month",
  "the mirror is the backup; the database is the index",
];

/** A one-pixel PNG, so what is uploaded is an image rather than a pretend one. */
const PIXEL: Uint8Array<ArrayBuffer> = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

const ALREADY_DONE = 409;

function idFor(index: number): string {
  return `0198f0c2-0000-7000-8000-${String(index).padStart(12, "0")}`;
}

/** A UUID variant apart from `idFor`'s, so an item and an asset never share an id. */
function assetIdFor(index: number): string {
  return `0198f0c2-0001-7000-8000-${String(index).padStart(12, "0")}`;
}

function timeFor(index: number): string {
  return `2026-08-01T09:${String(index % 60).padStart(2, "0")}:00.000Z`;
}

/**
 * A repeat of a decision the pool has already recorded answers 409, which is
 * the pool agreeing rather than the seeding failing.
 */
async function unlessDone(act: () => Promise<unknown>): Promise<void> {
  try {
    await act();
  } catch (cause) {
    if (!(cause instanceof HttpFailure) || cause.status !== ALREADY_DONE) {
      throw cause;
    }
  }
}

/**
 * Fills a pool over `/v1`, and only over `/v1`: what it produces is what a
 * client could have produced. Capture is idempotent on `sourceItemId`, so
 * seeding the same pool twice matches what is already there.
 *
 * Routing needs destinations the daemon was configured with — the README says
 * what it expects to find, and what each one is left holding.
 */
export async function seed(
  baseUrl: string,
  options: SeedOptions = {},
): Promise<Seeded> {
  const http = httpAt(baseUrl, options.fetch);
  const offset = options.offset ?? 0;

  const capture = async (
    index: number,
    payload: Payload,
    from = options.source ?? "web-manual",
  ): Promise<string> => {
    const at = index + offset;
    const outcome = await http.post<CaptureOutcome>("/v1/captures", {
      id: idFor(at),
      source: from,
      sourceItemId: `seed-${at}`,
      capturedAt: timeFor(at),
      payload: {
        type: payload.type,
        content: payload.content,
        metadata: {},
        assets: payload.assets ?? [],
      },
    });
    return outcome.item.id;
  };

  const said = (index: number): Promise<string> =>
    capture(index, {
      type: options.payloadType ?? "note",
      content: { text: SAID[index - 1] ?? SAID[0] },
    });

  const queued = [await said(1), await said(2)];

  const processed = await said(3);
  await unlessDone(() =>
    http.post(`/v1/items/${processed}/mark-processed`, {
      note: "pasted into the vault by hand",
    }),
  );

  const archived = await said(4);
  await unlessDone(() =>
    http.post(`/v1/items/${archived}/archive`, {
      reason: "read it, kept nothing",
    }),
  );

  const forDestinations = [await said(5), await said(6)];

  return {
    queued,
    processed: [processed],
    archived: [archived],
    withImage: await captureAnImage(http, capture, options, 7),
    routed: await routeEach(http, forDestinations, options),
  };
}

/** The id is the seeder's, so a second seeding replays the same upload rather than making a second asset. */
async function captureAnImage(
  http: Http,
  capture: (index: number, payload: Payload, from?: string) => Promise<string>,
  options: SeedOptions,
  index: number,
): Promise<{ item: string; asset: string }> {
  // `capture` shifts an index by the offset itself; the asset id is minted
  // here, so it is shifted here.
  const asset = assetIdFor(index + (options.offset ?? 0));
  await http.upload(asset, "pixel.png", "image/png", PIXEL);

  const item = await capture(
    index,
    {
      type: options.payloadType ?? "note",
      content: { text: "the whiteboard, before anyone rubbed it out" },
      assets: [{ slot: options.imageSlot ?? "image", asset }],
    },
    options.imageSource ?? "web-image",
  );

  return { item, asset };
}

/**
 * One item per destination, in the order the pool holds them. What a
 * destination can do is a second read, and one that cannot say is skipped:
 * routing to it is refused, because no arguments can be checked against nothing.
 */
async function routeEach(
  http: Http,
  items: readonly string[],
  options: SeedOptions,
): Promise<readonly { item: string; destination: string }[]> {
  const capability = options.capability ?? "create-file";
  const { values } = await http.get<Destinations>("/v1/destinations");
  const sent: { item: string; destination: string }[] = [];

  // An item is spent only when a destination takes it, so a skipped
  // destination leaves it for the next one rather than using it up.
  let next = 0;

  for (const destination of values) {
    const item = items[next];
    if (item === undefined) break;
    if (destination.retired) continue;

    const described = await http.get<DestinationDescription>(
      `/v1/destinations/${destination.id}/description`,
    );
    if (
      described.kind !== "described" ||
      !described.capabilities.some((each) => each.name === capability)
    ) {
      continue;
    }
    next += 1;

    const records = await http.get<RoutingRecords>(`/v1/items/${item}/routing`);
    if (records.values.length === 0) {
      await http.post(`/v1/items/${item}/route`, {
        destination: destination.id,
        capability,
        arguments: {
          directory: options.directory ?? "seeded",
          filename: `${item}.md`,
        },
      });
    }
    sent.push({ item, destination: destination.id });
  }

  return sent;
}
