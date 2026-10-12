import type { Storage } from "../storage";
import { json } from "../utils/responses";

export function storageHandler(storage: Storage) {
  return async (): Promise<Response> => json(await storage.read(), 200);
}

export function measureStorageHandler(storage: Storage) {
  return async (): Promise<Response> => json(await storage.measure(), 200);
}

export function reclaimHandler(storage: Storage) {
  return async (): Promise<Response> => json(await storage.reclaim(), 200);
}
