/**
 * Whether this browser will hand over the clipboard at all. `navigator.clipboard`
 * exists only in a secure context — HTTPS, or `localhost`, which browsers trust
 * without a certificate — and a self-hosted daemon reached over plain HTTP at a
 * LAN address has neither. There is nothing to fall back to, so the shell offers
 * no copy there rather than drawing one that fails when it is taken.
 */
export function copyable(): boolean {
  return navigator.clipboard !== undefined;
}
