import { createHash, timingSafeEqual } from "crypto";
import { TOKEN_PART_SEPARATOR } from "./config";

/** What a session and an access token both are: a named row, and a secret only its holder has. */
export type MintedSecret = {
  readonly id: string;
  /** `<prefix>.<id>.<secret>`, or `<id>.<secret>` unprefixed. Shown once, never stored. */
  readonly token: string;
  /** Base64, and what the row keeps. */
  readonly secretHash: string;
};

export type ParsedToken = {
  readonly id: string;
  /** Base64url, as it arrived. */
  readonly secret: string;
};

// From https://raw.githubusercontent.com/lucia-auth/lucia/refs/heads/main/code/auth_session.ts
export const getRandomId = () => {
  // Human readable alphabet (a-z, 0-9 without l, o, 0, 1 to avoid confusion).
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";

  // Generate 16 random bytes.
  // We're only going to use 5 bits per byte so the total entropy will be 128 * 5 / 8 = 80 bits.
  const bytes = new Uint8Array(16);

  // It's important to use a cryptographically-secure random source.
  crypto.getRandomValues(bytes);

  let id = "";
  for (let i = 0; i < bytes.length; i++) {
    // >> 3 "removes" the right-most 3 bits of the byte, leaving us with 5 bits (0-31).
    id += alphabet[bytes[i]! >> 3];
  }
  return id;
};

export const hashSecret = (secret: Uint8Array<ArrayBuffer>) => {
  const secretHashBuffer = createHash("sha256").update(secret).digest();
  const secretHash = new Uint8Array(secretHashBuffer);
  return secretHash;
};

export const mintSecret = async (prefix?: string): Promise<MintedSecret> => {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);

  const secretHash = hashSecret(secret);
  const id = getRandomId();

  const token = [
    prefix?.length ? prefix : undefined,
    id,
    Buffer.from(secret).toString("base64url"),
  ]
    .filter(Boolean)
    .join(TOKEN_PART_SEPARATOR);

  return {
    id,
    token,
    secretHash: Buffer.from(secretHash).toString("base64"),
  };
};

export const parseSecret = (
  token: string,
  prefix?: string,
): ParsedToken | undefined => {
  const parts = token.split(TOKEN_PART_SEPARATOR);

  const expectedNumberOfParts = prefix ? 3 : 2;
  if (parts.length !== expectedNumberOfParts) return undefined;
  if (prefix && parts[0] !== prefix) return undefined;

  const [id, secret] = parts.slice(prefix ? 1 : 0);

  if (!id?.length || !secret?.length) return undefined;

  return { id, secret };
};

/** Anything filed under an id and proved by a secret: a session, an access token. */
type Verifiable = { readonly secretHash: string };

/**
 * Parse, look up, compare — the three steps a session and an access token do
 * identically. Whether the record has since expired is the caller's, because
 * that is the only part where the two genuinely differ.
 *
 * The comparison runs before any expiry check, so a record is only ever acted
 * on for someone who actually holds its secret.
 */
export const verifySecret = async <R extends Verifiable>(
  token: string,
  find: (id: string) => Promise<R | undefined>,
  prefix?: string,
): Promise<R | undefined> => {
  const parsed = parseSecret(token, prefix);
  if (!parsed) return undefined;

  const record = await find(parsed.id);
  if (!record) return undefined;

  const stored = Buffer.from(record.secretHash, "base64");
  const offered = hashSecret(Buffer.from(parsed.secret, "base64url"));

  return stored.length === offered.length && timingSafeEqual(offered, stored)
    ? record
    : undefined;
};

/**
 * Both sides are UTC to the millisecond, but the intent is an instant rather
 * than a string. A timestamp neither side can read counts as passed: it is not
 * a guarantee that something is still good, and the alternative is a row that
 * never expires because its expiry is unreadable.
 */
export const hasPassed = (now: string, at: string): boolean => {
  const reached = Date.parse(at);
  const current = Date.parse(now);

  if (Number.isNaN(reached) || Number.isNaN(current)) return true;

  return current >= reached;
};

/**
 * Equality that takes the same time whatever differs, over strings of any
 * length — `timingSafeEqual` needs two buffers the same size, and hashing first
 * is what gives it them.
 */
export const sameSecretly = (a: string, b: string): boolean =>
  timingSafeEqual(
    hashSecret(Buffer.from(a, "utf8")),
    hashSecret(Buffer.from(b, "utf8")),
  );
