import type { ProviderName, SourceId } from "./ids";

export type Agent =
  /** Notemap itself, for work it drives rather than performs on anyone's behalf. */
  | { readonly kind: "notemap" }
  | { readonly kind: "person" }
  | { readonly kind: "provider"; readonly provider: ProviderName }
  | { readonly kind: "source"; readonly source: SourceId };
