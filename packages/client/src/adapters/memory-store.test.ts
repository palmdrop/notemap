import { describe } from "vitest";

import { createMemoryStore } from "./memory-store";
import { storeContract } from "./store-contract.test";

describe("the in-memory store", () => {
  storeContract(() => Promise.resolve(createMemoryStore()));
});
