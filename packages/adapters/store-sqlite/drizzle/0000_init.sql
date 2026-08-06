CREATE TABLE `actions` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject` text,
	`by_kind` text NOT NULL,
	`by_ref` text,
	`at` integer NOT NULL,
	`detail` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `actions_subject` ON `actions` (`subject`,`at`);--> statement-breakpoint
CREATE INDEX `actions_at` ON `actions` (`at`);--> statement-breakpoint
CREATE TABLE `item_assets` (
	`item_id` text NOT NULL,
	`slot` text NOT NULL,
	`asset_id` text NOT NULL,
	`hash` text NOT NULL,
	PRIMARY KEY(`item_id`, `slot`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `item_assets_asset` ON `item_assets` (`asset_id`);--> statement-breakpoint
CREATE TABLE `item_tags` (
	`item_id` text NOT NULL,
	`name` text NOT NULL,
	`by_kind` text NOT NULL,
	`by_ref` text,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`item_id`, `name`),
	FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`source_item_id` text NOT NULL,
	`payload_type` text NOT NULL,
	`payload_content` text NOT NULL,
	`payload_metadata` text NOT NULL,
	`created_at` integer NOT NULL,
	`content_updated_at` integer,
	`modified_at` integer NOT NULL,
	`revision_of` text,
	`archived_at` integer,
	`archive_reason` text,
	FOREIGN KEY (`revision_of`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `items_feed` ON `items` (`created_at`,`id`);--> statement-breakpoint
CREATE INDEX `items_revision_of` ON `items` (`revision_of`);--> statement-breakpoint
CREATE INDEX `items_modified_at` ON `items` (`modified_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `items_source_identity` ON `items` (`source_id`,`source_item_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`subject` text NOT NULL,
	`enrichment` text,
	`attempt` integer NOT NULL,
	`enqueued_at` integer NOT NULL,
	FOREIGN KEY (`subject`) REFERENCES `items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_claimable` ON `jobs` (`kind`,`enqueued_at`);--> statement-breakpoint
CREATE TABLE `pool_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` integer NOT NULL
);
