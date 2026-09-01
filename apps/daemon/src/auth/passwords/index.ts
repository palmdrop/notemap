import { randomBytes, timingSafeEqual } from "crypto";

import scrypt from "./scrypt";
import { normalise, normalisePassword } from "./normalise";
import { UnreadableHash } from "./errors";
import { DEFAULT_ALGORITHM } from "./config";

const SEPARATOR = "$";

export const splitHash = (hash: string) => hash.split(SEPARATOR);
export const joinHash = (parts: (string | number)[]) => parts.join(SEPARATOR);

export type HashResult<
  P extends Record<string, unknown> = Record<string, unknown>,
> = {
  algorithm: string;
  salt: Buffer<ArrayBuffer>;
  key: Buffer<ArrayBuffer>;
  params: P;
};

export type Algorithm = {
  hash: (
    password: string,
    salt: Buffer<ArrayBuffer>,
    params?: Record<string, unknown>,
  ) => Promise<string>;
  decode: (hash: string) => Promise<HashResult>;
  /** Whether a hash written under these parameters is behind the current ones. */
  needsRehash: (params: Record<string, unknown>) => boolean;
};

export type AlgorithmName = "scrypt";

const ALGORITHMS: { [key in AlgorithmName]: Algorithm } = {
  scrypt: scrypt,
};

const generateSalt = () => randomBytes(128);

const resolveAlgorithm = (algorithmName?: AlgorithmName) => {
  if (!algorithmName) {
    throw new UnreadableHash("no algorithm name provided");
  }

  const algorithm = ALGORITHMS[algorithmName];

  if (!algorithm) {
    throw new UnreadableHash("unknown algorithm");
  }

  return algorithm;
};

export const hashPassword = async (
  password: string,
  algorithmName = DEFAULT_ALGORITHM,
  params?: Record<string, unknown>,
) => {
  const normalisedPassword = normalisePassword(password);
  const algorithm = resolveAlgorithm(algorithmName);
  const salt = generateSalt();
  return algorithm.hash(normalisedPassword, salt, params);
};

export const verifyPassword = async (password: string, stored: string) => {
  const parts = splitHash(stored);
  if (!parts[0]) {
    throw new UnreadableHash("invalid hash");
  }

  const algorithmName = parts[0] as AlgorithmName; // NOTE: Assumes first part is always the algorithm name, regardless of algorithm
  const algorithm = resolveAlgorithm(algorithmName);
  const expected = await algorithm.decode(stored);
  const normalisedPassword = normalise(password);

  if (!normalisedPassword.ok) {
    return false;
  }

  const actual = await algorithm.decode(
    await algorithm.hash(
      normalisedPassword.password,
      expected.salt,
      expected.params,
    ),
  );

  return (
    expected.key.length === actual.key.length &&
    timingSafeEqual(expected.key, actual.key)
  );
};
/**
 * Whether a stored hash was written under something weaker than this build
 * would write now — a different algorithm, or the same one turned down. The
 * answer is only useful where the password is at hand to rewrite it with.
 */
export const needsRehash = async (stored: string): Promise<boolean> => {
  const parts = splitHash(stored);
  if (parts[0] !== DEFAULT_ALGORITHM) return true;

  const algorithm = resolveAlgorithm(parts[0]);
  const { params } = await algorithm.decode(stored);

  return algorithm.needsRehash(params);
};
