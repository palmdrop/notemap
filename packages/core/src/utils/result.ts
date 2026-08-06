import type { Result } from "../types/result";

export function ok<T, E>(value: T): Result<T, E> {
  return { kind: "ok", value };
}

export function refused<T, E>(refusal: E): Result<T, E> {
  return { kind: "refused", refusal };
}
