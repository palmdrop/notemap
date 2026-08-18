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

export type Destination =
  | {
      readonly kind: "described";
      readonly id: string;
      readonly capabilities: readonly Capability[];
    }
  | {
      readonly kind: "undescribable";
      readonly id: string;
      readonly detail: string;
    };

export type Destinations = {
  readonly values: readonly Destination[];
};

export type RoutingRecords = {
  readonly values: readonly { readonly id: string; readonly state: string }[];
};
