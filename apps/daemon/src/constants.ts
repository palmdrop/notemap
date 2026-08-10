import type { FeedOrder } from "@notemap/core";

export const JSON_TYPE = "application/json; charset=utf-8";
export const JSON_MEDIA_TYPE = "application/json";

export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 4747;

export const FEED_ORDERS: readonly FeedOrder[] = [
  "newest-first",
  "oldest-first",
];

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

export const DEFAULT_RETRY = {
  maxAttempts: 5,
  initialBackoff: 1000,
  maxBackoff: 60_000,
};

export const SHUTDOWN_GRACE_MS = 2_000;
