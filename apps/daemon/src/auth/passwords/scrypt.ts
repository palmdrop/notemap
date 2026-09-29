import { scrypt } from "crypto";
import { splitHash, joinHash, type Algorithm, type HashResult } from ".";
import { UnreadableHash } from "./errors";

export type ScryptParams = {
  N: number;
  r: number;
  p: number;
  keylen: number;
};

type Result = HashResult<ScryptParams>;

/**
 * OWASP's floor for scrypt is `N=2^17, r=8, p=1`, and it lists `N=2^16, r=8,
 * p=2` beside it as the same work for half the memory. That is the one worth
 * having here: 128 MiB per call is 512 MiB in flight across libuv's threadpool,
 * which is a lot to ask of the small machines this is meant to run on.
 */
const defaultParams: ScryptParams = {
  N: 65536,
  r: 8,
  p: 2,
  keylen: 64,
};

/** `128 * N * r` is what scrypt needs; the rest is room for the parameters to move. */
const MAXMEM = 96 * 1024 * 1024;

const decodeHash = (encodedHash: string) => {
  const [algorithm, keylen, N, r, p, salt, key] = splitHash(encodedHash);

  if (!algorithm || !keylen || !N || !r || !p || !salt || !key) {
    throw new UnreadableHash("invalid hash");
  }

  const decodedHash = {
    algorithm,
    salt: Buffer.from(salt, "base64"),
    key: Buffer.from(key, "base64"),
    params: {
      keylen: parseInt(keylen),
      N: parseInt(N),
      r: parseInt(r),
      p: parseInt(p),
    },
  };

  Object.values(decodedHash.params).forEach((value) => {
    if (isNaN(value)) {
      throw new UnreadableHash("invalid hash");
    }
  });

  return decodedHash;
};

const encodeHash = ({ algorithm, salt, key, params }: Result) => {
  return joinHash([
    algorithm,
    params.keylen,
    params.N,
    params.r,
    params.p,
    salt.toString("base64"),
    key.toString("base64"),
  ]);
};

const hash = (
  password: string,
  salt: Buffer<ArrayBuffer>,
  params = defaultParams,
) =>
  new Promise<Result>((resolve, reject) => {
    scrypt(
      password,
      salt,
      params.keylen as number,
      {
        N: params.N as number,
        r: params.r as number,
        p: params.p as number,
        maxmem: MAXMEM,
      },
      (err, key) => {
        if (err) {
          reject("error hashing password");
          return;
        }

        resolve({
          algorithm: "scrypt",
          salt,
          key,
          params,
        });
      },
    );
  });

const handlers = {
  hash: async (
    password: string,
    salt: Buffer<ArrayBuffer>,
    params?: ScryptParams,
  ) => {
    const result = await hash(password, salt, params as ScryptParams);
    return encodeHash(result);
  },
  decode: async (hash: string) => decodeHash(hash),
  // Only ever upwards: rewritten when the current parameters are at least as
  // much work and memory and more of one, so neither ever goes down.
  needsRehash: (
    params: Record<string, unknown>,
    current: ScryptParams = defaultParams,
  ) => {
    const stored = params as ScryptParams;
    const work = ({ N, r, p }: ScryptParams) => N * r * p;
    const memory = ({ N, r }: ScryptParams) => N * r;

    const behind =
      work(stored) <= work(current) && memory(stored) <= memory(current);
    const same =
      work(stored) === work(current) && memory(stored) === memory(current);

    return behind && !same;
  },
} as Algorithm;

export default handlers;
