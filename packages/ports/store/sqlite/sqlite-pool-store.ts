// import type { PoolStore } from "../types";
// TODO: replace with better-sqlite3 probably?
import sqlite from 'node:sqlite';

type SQLitePoolStoreConfig = {
  connectionString: string 
}

export const createSQLitePoolStore = (config: SQLitePoolStoreConfig): PoolStore => {
  // TODO: error handling
  const database = new sqlite.DatabaseSync(config.connectionString, {
    open: true
  });

  database.exec(POOL_STORE_SCHEMA);

  return {

  }
}