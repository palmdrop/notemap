
// TODO: use better-sqlite3 and drizzle-orm 
// TODO: remember sqlite.pragma('foreign_keys = on')

import { sqliteTable, text, text, integer, boolean, datetime } from 'drizzle-orm/sqlite-core';

export const sources = sqliteTable('sources', {
  id: text('id').primaryKey()
});

export const items = sqliteTable('users', {
  id: text('id').primaryKey(),
  sourceId: text('source_id').notNull().references(() => sources.id),
  sourceItemId: text('source_item_id').notNull().unique(),
  // payload: ???
  // tags: ???
  createdAt: datetime('created_at').notNull().defaultNow(),
  contentUpdatedAt: datetime('created_at'),
  revisionOf: text('revision_of').references(() => items.id),
  archived: boolean('archived'),
  archivedReason: text('archived_reason')
});
