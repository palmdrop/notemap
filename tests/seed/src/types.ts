/**
 * Only what the seeder reads back. The full shapes are the daemon's, and
 * `@notemap/client` already carries them generated from its OpenAPI document —
 * depending on either to name an `id` would make a seeding tool a client of the
 * domain.
 */

export type Item = {
  readonly id: string;
};

export type Asset = {
  readonly id: string;
  readonly blob: string;
  readonly bytes: number;
};

export type CaptureOutcome = {
  readonly kind: "captured" | "already-captured";
  readonly item: Item;
};

export type Capability = {
  readonly name: string;
  readonly accepts: readonly string[];
};

export type Destination = {
  readonly id: string;
  readonly name: string;
  readonly retired: boolean;
};

export type Destinations = {
  readonly values: readonly Destination[];
};

/** What one destination answered when asked, which the list never says. */
export type DestinationDescription =
  | { readonly kind: "described"; readonly capabilities: readonly Capability[] }
  | {
      readonly kind: "undescribable" | "unusable";
      readonly detail: string;
    };

export type RoutingRecords = {
  readonly values: readonly { readonly id: string; readonly state: string }[];
};
