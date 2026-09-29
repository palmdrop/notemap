import type { ScryptParams } from "../auth/passwords/scrypt";

/** Scrypt turned far down, for tests about anything other than what hashing costs. */
export const CHEAP_HASHING: ScryptParams = { N: 1024, r: 8, p: 1, keylen: 32 };
