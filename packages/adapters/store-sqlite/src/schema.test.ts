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

  it("takes any number of revisions of one item", async () => {
    const opened = store();
    try {
      opened.raw.exec("PRAGMA foreign_keys = ON");
      const insert = `INSERT INTO items (id, source_id, source_item_id,
        payload_type, payload_content, payload_metadata, created_at, modified_at, revision_of)
        VALUES (?, 'src', ?, 'text', '{}', '{}', 1, ?, ?)`;

      opened.raw.prepare(insert).run("original", "a", 1, null);
      opened.raw.prepare(insert).run("revision", "b", 2, "original");

      expect(() =>
        opened.raw.prepare(insert).run("second-revision", "c", 3, "original"),
      ).not.toThrow();
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

      opened.raw
        .prepare(
          `INSERT INTO destinations
             (id, name, kind, settings, created_at, modified_at)
           VALUES ('vault', 'Vault', 'filesystem', '{}', 1, 1)`,
        )
        .run();

      const record = opened.raw.prepare(
        `INSERT INTO routing_records
           (id, item_id, target_kind, destination, capability, note, target,
            state, at)
         VALUES (?, 'item', ?, ?, ?, ?, ?, 'delivered', 1)`,
      );
      const targeted = JSON.stringify({ path: "inbox/a.md" });

      // Args are (id, target_kind, destination, capability, note, target).
      expect(() =>
        record.run("a", "destination", "vault", null, null, targeted),
      ).toThrow(/constraint/i);
      expect(() =>
        record.run("b", "user", "vault", "create", null, null),
      ).toThrow(/constraint/i);
      expect(() =>
        record.run(
          "c",
          "destination",
          "vault",
          "create",
          "where it went",
          targeted,
        ),
      ).toThrow(/constraint/i);
      expect(() =>
        record.run("d", "destination", "vault", "create", null, null),
      ).toThrow(/constraint/i);
      expect(() =>
        record.run("e", "user", null, null, "where it went", targeted),
      ).toThrow(/constraint/i);
      expect(() =>
        record.run("f", "destination", "vault", "create", null, targeted),
      ).not.toThrow();
      expect(() =>
        record.run("g", "user", null, null, "where it went", null),
      ).not.toThrow();
    } finally {
      await opened.cleanup();
    }
  });

  /**
   * The in-use refusal is the schema's, not a check core has to remember: a
   * routing record's destination is a reference, and it must go on resolving.
   */
  it("refuses to delete a destination a routing record names", async () => {
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
      opened.raw
        .prepare(
          `INSERT INTO destinations
             (id, name, kind, settings, created_at, modified_at)
           VALUES ('vault', 'Vault', 'filesystem', '{}', 1, 1)`,
        )
        .run();

      const remove = opened.raw.prepare(
        "DELETE FROM destinations WHERE id = 'vault'",
      );
      expect(() => remove.run()).not.toThrow();

      opened.raw
        .prepare(
          `INSERT INTO destinations
             (id, name, kind, settings, created_at, modified_at)
           VALUES ('vault', 'Vault', 'filesystem', '{}', 1, 1)`,
        )
        .run();
      opened.raw
        .prepare(
          `INSERT INTO routing_records
             (id, item_id, target_kind, destination, capability, target, state, at)
           VALUES ('r', 'item', 'destination', 'vault', 'create', '{}', 'pending', 1)`,
        )
        .run();

      expect(() => remove.run()).toThrow(/FOREIGN KEY/i);
    } finally {
      await opened.cleanup();
    }
  });

  it("refuses a record naming a destination the pool does not hold", async () => {
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

      expect(() =>
        opened.raw
          .prepare(
            `INSERT INTO routing_records
               (id, item_id, target_kind, destination, capability, target, state, at)
             VALUES ('r', 'item', 'destination', 'ghost', 'create', '{}', 'pending', 1)`,
          )
          .run(),
      ).toThrow(/FOREIGN KEY/i);
    } finally {
      await opened.cleanup();
    }
  });

  it("holds every item to one source identity, revisions included", async () => {
    const opened = store();
    try {
      const insert = `INSERT INTO items (id, source_id, source_item_id,
        payload_type, payload_content, payload_metadata, created_at, modified_at, revision_of)
        VALUES (?, 'src', 'same', 'text', '{}', '{}', 1, ?, ?)`;

      opened.raw.prepare(insert).run("original", 1, null);
      // A revision mints its own identity, so it claims one like anything else.
      expect(() =>
        opened.raw.prepare(insert).run("revision", 2, "original"),
      ).toThrow(/UNIQUE|constraint/i);
      expect(() =>
        opened.raw.prepare(insert).run("duplicate", 3, null),
      ).toThrow(/UNIQUE|constraint/i);
    } finally {
      await opened.cleanup();
    }
  });
});
