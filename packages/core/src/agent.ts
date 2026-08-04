import type { ProviderName, SourceId } from "./ids.js";

/**
 * A person carries no identity: a pool has exactly one user, and
 * authentication is a host concern.
 */
export type Agent =
  | { readonly kind: "person" }
  | { readonly kind: "provider"; readonly provider: ProviderName }
  | { readonly kind: "source"; readonly source: SourceId };
