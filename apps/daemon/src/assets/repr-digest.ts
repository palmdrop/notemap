/**
 * `Repr-Digest` (RFC 9530), as far as notemap computes it.
 *
 * The RFC lets a recipient ignore an algorithm it does not support. It does not
 * license ignoring a *supported* one whose value is unreadable: a client that
 * spells the field wrong would otherwise be told its bytes were verified.
 */

const SHA256 = /(?:^|,)\s*sha-256\s*=\s*:([^:]*):/i;

const DIGEST_BYTES = 32;

export type ClaimedDigest =
  /** No `sha-256` entry, or none notemap computes. Nothing to check. */
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "sha-256"; readonly hex: string };

export function claimedDigest(header: string | undefined): ClaimedDigest {
  if (header === undefined || header.trim() === "") return { kind: "absent" };

  const encoded = SHA256.exec(header)?.[1];
  if (encoded === undefined) {
    return /(?:^|,)\s*sha-256\s*=/i.test(header)
      ? { kind: "unreadable" }
      : { kind: "absent" };
  }

  const decoded = Buffer.from(encoded, "base64");
  return decoded.byteLength === DIGEST_BYTES
    ? { kind: "sha-256", hex: decoded.toString("hex") }
    : { kind: "unreadable" };
}
