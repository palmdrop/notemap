export const MIGRATIONS: readonly string[] = [
  `
  CREATE TABLE credential (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    username      TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    changed_at    INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE sessions (
    id          TEXT NOT NULL PRIMARY KEY,
    secret_hash TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  ) STRICT;

  CREATE TABLE tokens (
    id            TEXT NOT NULL PRIMARY KEY,
    name          TEXT NOT NULL,
    secret_hash   TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    expires_at    INTEGER,
    last_used_at  INTEGER
  ) STRICT;
  `,
];
