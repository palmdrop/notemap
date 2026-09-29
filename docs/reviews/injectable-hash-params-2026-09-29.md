# Review: Injectable hash parameters (PR #83)

**Date**: 2026-09-29
**Status**: Resolved
**Scope**: `apps/daemon/src/auth/index.ts`, `apps/daemon/src/auth/passwords/{index,scrypt}.ts`, `apps/daemon/src/testing/hashing.ts`, the daemon test files that now pass `CHEAP_HASHING` (commit f334569f)
**Spec**: `docs/specs/security.md`

---

## Overall

The fix goes after the actual cause, production-strength scrypt in tests that aren't about hashing, and the `needsRehash` change is correct. Only-upwards still holds when `current` is injected, and a hash at production strength read by an auth built with `CHEAP_HASHING` is not downgraded. Production wiring (`openAuth`) passes no `hashing` option, so today nothing in production can end up on cheap parameters. The main finding is the option's type. `Record<string, unknown>` accepts a misspelled key without complaint, and that misspelling writes a credential nobody can read.

---

## Bugs

None.

---

## Design

### 1. `hashing` is typed loosely enough to write an unreadable credential

`apps/daemon/src/auth/index.ts:17`, `apps/daemon/src/auth/passwords/scrypt.ts:114-120`. `hashing?: Record<string, unknown>` passes typecheck for any object, and nothing between `createAuth` and `crypto.scrypt` checks it. Probed against this branch:

```
{ n: 1024, r: 8, p: 1, keylen: 32 }   (lowercase n)
→ Node's scrypt falls back to its own N=16384, encodeHash writes params.N = undefined
→ stored "scrypt$32$$8$1$…"
→ every login: UnreadableHash → logged and refused → locked out until `notemap password set`
```

A partial object fails in other ways. `{ N: 1024 }` makes `setPassword` throw `TypeError [ERR_INVALID_ARG_TYPE]` (keylen). As `current`, `needsRehash(stored, { N: 2 ** 20 })` returns true and the rehash then throws inside `login`, which gives a 500 on a correct password. `{ r, p, keylen }` with no `N` compares `N < undefined`, which is always false, so the hash is never rehashed on N and nothing says so. `const wanted = current as Params` is an unchecked cast.

Only tests pass `hashing` today, so this is a trap for the next caller: the day someone threads it from config or an env var. Fix: export scrypt's `Params` and type `AuthParams.hashing` as the full `Params` (not `Partial`), with `needsRehash`'s `current` typed the same. `createAuth` always hashes with `DEFAULT_ALGORITHM`, so the default algorithm's parameter type is the right one. The generic `Algorithm` interface staying loose is pre-existing and can stay.

---

## Minor

### 2. `passwords.test.ts` still runs full strength where cost is not the point

`apps/daemon/src/auth/passwords/passwords.test.ts`. The PR says this file keeps real defaults "where cost is the point". For most of the file it isn't: normalisation, encoding and verification don't depend on N. Measured alone on this branch: "keeps compatibility variants apart" takes 1240 ms (6 scrypt operations), "refuses any other password" 858 ms, and "takes two spellings of the same accent…" 832 ms. The worst is ~44% of the failing test's 2.8 s solo time. That's probably inside the margin, but it's the next one to go. These hashes are also part of the CPU contention that pushed `session.test.ts` over the limit. Only the tests that assert defaults need them ("costs at least what OWASP asks", "encodes the algorithm, its parameters…", the three `needsRehash` default cases).

### 3. The rehash-to-production-defaults assertion was dropped

`apps/daemon/src/auth/auth.test.ts:171`. "is rewritten when the password next proves itself" used to assert that the rewrite landed at `65536`. It now asserts `CHEAP_HASHING.N`. The new default test (`auth.test.ts:208-222`) covers `setPassword` only. Nothing checks that `login` under a default `createAuth` rehashes to scrypt's defaults. Risk is low: the rehash goes through the same `hash` closure, and `needsRehash`'s default is covered in `passwords.test.ts`.

### 4. Only-upwards under injected parameters is exercised but not asserted

`apps/daemon/src/auth/auth.test.ts:175`. "is left alone when it was written under what is hashed with now" covers equal parameters. The case this PR makes possible (stored at defaults, auth built with `CHEAP_HASHING`, hash left alone) happens in `cli/password.test.ts`: the CLI writes defaults through `openAuth` and the test's auth signs in under `CHEAP_HASHING`. Nothing checks the stored hash afterwards. The new test also sits under `describe("a password stored under weaker parameters")`, which is not what it tests.

### 5. The test for scrypt's defaults duplicates the `auth()` fixture

`apps/daemon/src/auth/auth.test.ts:208-222` re-creates the directory, store and cleanup inline because `auth()` hard-codes `CHEAP_HASHING`. Letting `auth()` take `hashing` would remove the duplication.

### 6. Only-upwards compares each parameter separately, not total cost (pre-existing, in a touched function)

`apps/daemon/src/auth/passwords/scrypt.ts:112-120`. A hash stored at `N=2^17, r=8, p=1` (OWASP's floor, the same cost as the default) has `p` below the default's `2`, so it is rehashed and `N` is halved. The comment claims a stronger hash is "left alone rather than weakened". It only holds when every parameter is at least the current one. This PR didn't introduce it.

---

## Non-issues

- **A constructor option rather than `vi.mock` or an env var**: explicit, visible at every call site, and it adds no knob that could reach a deployment.
- **No spec or doc change**: production behaviour is unchanged. `docs/specs/security.md` doesn't describe hash parameters or rehashing. `CHEAP_HASHING` lives in `src/testing/` and no non-test code imports it.
- **`needsRehash(productionHash, CHEAP_HASHING)` is false**: stronger than current is left alone, so injecting cheap parameters never downgrades an existing credential.
- **`keylen` is not compared in `needsRehash`**: pre-existing. `CHEAP_HASHING.keylen = 32` against the default 64 doesn't matter.
- **`cli/password.test.ts` still ~450–650 ms per test**: the command goes through `openAuth`, which is the production path. Making it cheap would need a `hashing` seam on `openAuth` too, which isn't worth it at ~7x headroom.
- **Relative imports of `../testing/hashing`**: `apps/daemon` names no aliases.
- **Full-stack suite hashing at full strength**: it has its own 30 s `testTimeout`.

---

## Resolution

All six fixed on the same branch.

1. `ScryptParams` is exported from `scrypt.ts`. `AuthParams.hashing`, `needsRehash`'s `current` and `CHEAP_HASHING` all take the full type, so a misspelled or missing key no longer typechecks.
2. `passwords.test.ts` hashes through `cheaply` everywhere except the three tests that assert the defaults.
3. "is brought up to scrypt's defaults when nothing else is asked for" checks that `login` under a default `createAuth` rehashes to `65536`.
4. "is left alone rather than weakened when it is stronger" checks that a default-strength hash read under `CHEAP_HASHING` is left as it is. That test and the equal-parameters one moved to their own `describe`.
5. `auth()` takes `hashing`, where `null` means scrypt's defaults, and the inline fixture is gone.
6. `needsRehash` compares work (`N·r·p`) and memory (`N·r`). It rewrites a hash only when neither is above the current parameters and at least one is below. Checking either axis on its own would still rewrite a hash with less work and more memory, which lowers its memory. New cases: same work with more memory (OWASP's floor) is left alone; less work with more memory is left alone; same work with less memory is rewritten.

