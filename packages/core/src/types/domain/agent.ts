import type { ProviderName, SourceId } from "./ids";

export type Agent =
  | { readonly kind: "person" }
  | { readonly kind: "provider"; readonly provider: ProviderName }
  | { readonly kind: "source"; readonly source: SourceId };
