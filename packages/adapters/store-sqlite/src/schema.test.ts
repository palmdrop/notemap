import { describe, expect, it } from "vitest";

import { TABLE_COLUMNS } from "./rows";
import { store } from "./testing/fixture";

type ColumnInfo = { name: string; notnull: number; pk: number };

/**
 * Hand-written SQL cannot prove a row matches the type it is read as. These
 * close that from the other end: the row types in `rows.ts` and the DDL in
 * `migrations.ts` are compared against each other, so a column added to one and
 * forgotten in the other fails here rather than at a `undefined` three layers up.
 */
describe("the row types and the migrations agree", () => {
  it("declares exactly the columns each table has", async () => {
    const opened = store();
    try {
      for (const [table, declared] of Object.entries(TABLE_COLUMNS)) {
        const actual = opened.raw
          .prepare(`PRAGMA table_info(${table})`)
          .all() as unknown as ColumnInfo[];

        expect(actual.length, `${table} exists`).toBeGreaterThan(0);
        expect(actual.map((column) => column.name).sort()).toEqual(
          [...declared].sort(),
        );
      }
    } finally {
      await opened.cleanup();
    }
  });

  it("keeps the action log free of a cascade from items", async () => {
    const opened = store();
    try {
      const keys = opened.raw.prepare("PRAGMA foreign_key_list(actions)").all();
      expect(keys).toEqual([]);
    } finally {
      await opened.cleanup();
    }
  });

  it("enforces foreign keys and stores in WAL", async () => {
    const opened = store();
    try {
      expect(opened.raw.prepare("PRAGMA journal_mode").get()).toMatchObject({
        journal_mode: "wal",
      });
    } finally {
      await opened.cleanup();
    }
  });

  it("refuses a second revision of one item, so the chain cannot fork", async () => {
    const opened = store();
    try {
      opened.raw.exec("PRAGMA foreign_keys = ON");
      const insert = `INSERT INTO items (id, source_id, source_item_id,
        payload_type, payload_content, payload_metadata, created_at, modified_at, revision_of)
        VALUES (?, 'src', ?, 'text', '{}', '{}', 1, ?, ?)`;

      opened.raw.prepare(insert).run("original", "a", 1, null);
      opened.raw.prepare(insert).run("revision", "b", 2, "original");

      expect(() =>
        opened.raw.prepare(insert).run("fork", "c", 3, "original"),
      ).toThrow(/UNIQUE|constraint/i);
    } finally {
      await opened.cleanup();
    }
  });

  it("refuses an agent whose name disagrees with its kind", async () => {
    const opened = store();
    try {
      opened.raw.exec("PRAGMA foreign_keys = ON");
      opened.raw
        .prepare(
          `INSERT INTO items (id, source_id, source_item_id, payload_type,
           payload_content, payload_metadata, created_at, modified_at)
           VALUES ('item', 'src', 'a', 'text', '{}', '{}', 1, 1)`,
        )
        .run();

      const tag = opened.raw.prepare(
        `INSERT INTO item_tags (item_id, name, by_kind, by_ref, added_at)
         VALUES ('item', ?, ?, ?, 1)`,
      );

      // A person is anonymous; a provider or source is named.
      expect(() => tag.run("a", "person", "someone")).toThrow(/constraint/i);
      expect(() => tag.run("b", "provider", null)).toThrow(/constraint/i);
      expect(() => tag.run("c", "provider", "whisper")).not.toThrow();
    } finally {
      await opened.cleanup();
    }
  });

  it("refuses a routing record whose columns disagree with its target", async () => {
    const opened = store();
    try {
      opened.raw.exec("PRAGMA foreign_keys = ON");
      opened.raw
        .prepare(
          `INSERT INTO items (id, source_id, source_item_id, payload_type,
           payload_content, payload_metadata, created_at, modified_at)
           VALUES ('item', 'src', 'a', 'text', '{}', '{}', 1, 1)`,
        )
        .run();

      const record = opened.raw.prepare(
        `INSERT INTO routing_records
           (id, item_id, target_kind, destination, capability, note, state, at)
         VALUES (?, 'item', ?, ?, ?, ?, 'delivered', 1)`,
      );

      // A destination target names both halves; a user target names neither,
      // and is the only one that may carry a note.
      expect(() => record.run("a", "destination", "vault", null, null)).toThrow(
        /constraint/i,
      );
      expect(() => record.run("b", "user", "vault", "create", null)).toThrow(
        /constraint/i,
      );
      expect(() =>
        record.run("c", "destination", "vault", "create", "where it went"),
      ).toThrow(/constraint/i);
      expect(() =>
        record.run("d", "destination", "vault", "create", null),
      ).not.toThrow();
      expect(() =>
        record.run("e", "user", null, null, "where it went"),
      ).not.toThrow();
    } finally {
      await opened.cleanup();
    }
  });

  it("lets two revisions share the source identity they revise", async () => {
    const opened = store();
    try {
      const insert = `INSERT INTO items (id, source_id, source_item_id,
        payload_type, payload_content, payload_metadata, created_at, modified_at, revision_of)
        VALUES (?, 'src', 'same', 'text', '{}', '{}', 1, ?, ?)`;

      opened.raw.prepare(insert).run("original", 1, null);
      // A revision carries the identity of the capture it revises; the
      // uniqueness rule is about re-reading a source, which this is not.
      expect(() =>
        opened.raw.prepare(insert).run("revision", 2, "original"),
      ).not.toThrow();
      // A second *capture* under that identity is still refused.
      expect(() =>
        opened.raw.prepare(insert).run("duplicate", 3, null),
      ).toThrow(/UNIQUE|constraint/i);
    } finally {
      await opened.cleanup();
    }
  });
});
