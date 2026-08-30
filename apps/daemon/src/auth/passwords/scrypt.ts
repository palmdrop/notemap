import { scrypt } from "crypto";
import { splitHash, joinHash, type Algorithm, type HashResult } from ".";
import { UnreadableHash } from "./errors";

type Params = {
  N: number;
  r: number;
  p: number;
  keylen: number;
}

type Result = HashResult<Params>;

const defaultParams: Params = {
  N: 16384,
  r: 8,
  p: 1,
  keylen: 64
};

const MAXMEM = 64 * 1024 * 1024;

const decodeHash = (encodedHash: string) => {
  const [algorithm, keylen, N, r, p, salt, key] = splitHash(encodedHash);

  if(!algorithm || !keylen || !N || !r || !p || !salt || !key) {
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
    }
  }

  Object.values(decodedHash.params).forEach((value) => {
    if(isNaN(value)) {
      throw new UnreadableHash("invalid hash");
    }
  });

  return decodedHash;
}

const encodeHash = ({ algorithm, salt, key, params }: Result) => {
  return joinHash([
    algorithm, 
    params.keylen, 
    params.N, 
    params.r, 
    params.p, 
    salt.toString("base64"), 
    key.toString("base64")
  ]);
}

const hash = (password: string, salt: Buffer<ArrayBuffer>, params = defaultParams) => 
  new Promise<Result>((resolve, reject) => {
    scrypt(
      password, 
      salt, 
      params.keylen as number,
      {
        N: params.N as number,
        r: params.r as number,
        p: params.p as number,
        maxmem: MAXMEM
      },
      (err, key) => {
        if(err) {
          reject("error hashing password");
          return;
        }

        resolve({
          algorithm: "scrypt",
          salt,
          key,
          params
        });
      }
    );
  });

const handlers = {
  hash: async (password: string, salt: Buffer<ArrayBuffer>, params?: Params) => {
    const result = await hash(password, salt, params as Params); 
    return encodeHash(result);
  },
  decode: async (hash: string) => decodeHash(hash)
} as Algorithm;

export default handlers;