import type { Position, ReadOrder, SchemaIssue } from "@notemap/core";

export type ErrorBody = {
  readonly error: { readonly code: string } & Record<string, unknown>;
};

export type DaemonRefusal =
  | { readonly kind: "malformed-json" }
  | {
      readonly kind: "malformed-envelope";
      readonly issues: readonly SchemaIssue[];
    }
  | { readonly kind: "unsupported-media-type"; readonly contentType: string }
  | {
      readonly kind: "limit-too-large";
      readonly limit: number;
      readonly max: number;
    }
  | { readonly kind: "bad-limit"; readonly limit: string }
  | {
      readonly kind: "bad-order";
      readonly order: string;
      readonly allowed: readonly string[];
    }
  | { readonly kind: "bad-position"; readonly after: string }
  | { readonly kind: "missing-filename" }
  | { readonly kind: "bad-digest"; readonly digest: string }
  | {
      readonly kind: "digest-mismatch";
      readonly expected: string;
      readonly actual: string;
    }
  | { readonly kind: "asset-too-large"; readonly max: number }
  | { readonly kind: "no-such-item"; readonly item: string }
  | { readonly kind: "unknown-route"; readonly path: string }
  | {
      readonly kind: "method-not-allowed";
      readonly method: string;
      readonly allow: readonly string[];
    };

export type PageQuery =
  | {
      readonly ok: true;
      readonly limit: number;
      readonly after?: Position;
    }
  | { readonly ok: false; readonly refusal: DaemonRefusal };

/** The feed and the log let a reader choose an end; the queue and the archive do not. */
export type OrderedPageQuery =
  | (Extract<PageQuery, { ok: true }> & { readonly order: ReadOrder })
  | { readonly ok: false; readonly refusal: DaemonRefusal };
