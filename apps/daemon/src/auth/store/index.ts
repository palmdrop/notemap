import { openDatabase, migrate, statements } from "@notemap/sqlite";
import { MIGRATIONS } from "./migrations";
import { toCredential, toMillis, toSession, toToken } from "./mapping";
import {
  CREDENTIAL_COLUMNS,
  TOKEN_COLUMNS,
  type CredentialRow,
  type SessionRow,
  type TokenRow,
} from "./rows";
import type { AuthStore } from "./types";

type Config = {
  readonly file: string;
}

export const createSqliteAuthStore = (config: Config): AuthStore => {
  const database = openDatabase({
    file: config.file,
  });

  try {
    migrate(database.writer, MIGRATIONS, "auth");
  } catch (cause) {
    database.close();
    throw cause;
  }
  
  const { query } = statements(database.writer);

  const transact = (work: () => void) => {
    database.writer.exec("BEGIN IMMEDIATE");
    try {
      work();
      database.writer.exec("COMMIT");
    } catch (cause) {
      try {
        database.writer.exec("ROLLBACK");
      } catch {
        // Failed before begin, SQLite rolled back itself.
      }

      throw cause;
    }
  }

  const getCredential = query<CredentialRow, []>(
    `SELECT ${CREDENTIAL_COLUMNS} FROM credential WHERE id = 1`,
  );

  const setCredential = query<never, [string, string, number]>(`
    INSERT INTO credential (id, username, password_hash, changed_at)
    VALUES (1, ?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      username = excluded.username, 
      password_hash = excluded.password_hash, 
      changed_at = excluded.changed_at 
  `);

  const addSession = query<never, [string, string, number, number]>(`
    INSERT INTO sessions (id, secret_hash, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `);

  const getSession = query<SessionRow, [string]>(`
    SELECT id, secret_hash, created_at, expires_at FROM sessions WHERE id = ?
  `);

  const deleteSession = query<never, [string]>(`
    DELETE FROM sessions WHERE id = ?
  `);

  const deleteAllSessions = query<never, []>(`
    DELETE FROM sessions
  `);

  const addToken = query<
    never,
    [string, string, string, number, number | null, number | null]
  >(`
    INSERT INTO tokens (id, name, secret_hash, created_at, expires_at, last_used_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const getToken = query<TokenRow, [string]>(`
    SELECT ${TOKEN_COLUMNS} FROM tokens WHERE id = ?
  `);

  const touchToken = query<never, [number, string]>(`
    UPDATE tokens SET last_used_at = ? WHERE id = ?
  `);

  /** Oldest first, and by id where two were minted in the same millisecond. */
  const listTokens = query<TokenRow, []>(`
    SELECT ${TOKEN_COLUMNS} FROM tokens ORDER BY created_at, id
  `);

  const deleteToken = query<never, [string]>(`
    DELETE FROM tokens WHERE id = ?
  `);

  const deleteAllTokens = query<never, []>(`
    DELETE FROM tokens
  `);

  const deleteExpiredSessions = query<never, [number]>(`
    DELETE FROM sessions WHERE expires_at <= ?
  `);

  /** A token without an expiry never reaches one, so it is never swept. */
  const deleteExpiredTokens = query<never, [number]>(`
    DELETE FROM tokens WHERE expires_at IS NOT NULL AND expires_at <= ?
  `);

  return {
    cleanExpired: async (now) => {
      const millis = toMillis(now);
      deleteExpiredSessions.run(millis);
      deleteExpiredTokens.run(millis);
    },
    getCredential: async () => {
      const row = getCredential.get();
      return row && toCredential(row);
    },
    setCredential: async (credential) => {
      transact(() => {
        deleteAllSessions.run();
        setCredential.run(
          credential.name, 
          credential.passwordHash, 
          toMillis(credential.changedAt)
        );
      })
    },
    addSession: async (session) => {
      addSession.run(
        session.id,
        session.secretHash,
        toMillis(session.createdAt),
        toMillis(session.expiresAt)
      );
    },
    getSession: async (id) => {
      const row = getSession.get(id);
      return row && toSession(row);
    },
    deleteSession: async (id) => {
      deleteSession.run(id);
    },
    deleteAllSessions: async () => {
      deleteAllSessions.run();
    },
    addToken: async (token) => {
      addToken.run(
        token.id,
        token.name,
        token.secretHash,
        toMillis(token.createdAt),
        token.expiresAt === undefined ? null : toMillis(token.expiresAt),
        token.lastUsedAt === undefined ? null : toMillis(token.lastUsedAt)
      );
    },
    getToken: async (id) => {
      const row = getToken.get(id);
      return row && toToken(row);
    },
    touchToken: async (id, at) => {
      touchToken.run(toMillis(at), id);
    },
    listTokens: async () => listTokens.all().map(toToken),
    deleteToken: async (id) => {
      deleteToken.run(id);
    },
    deleteAllTokens: async () => {
      deleteAllTokens.run();
    },
    close: async () => database.close()
  }
};