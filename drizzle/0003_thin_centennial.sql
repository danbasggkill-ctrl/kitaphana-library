CREATE TABLE `point_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`created` integer NOT NULL,
	`applied` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_point_adjustments_recipient_created` ON `point_adjustments` (`recipient`,`created`);--> statement-breakpoint
CREATE TABLE `custom_books` (
	`id` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`published` integer DEFAULT 0 NOT NULL,
	`created` integer NOT NULL,
	`updated` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_custom_books_published_created` ON `custom_books` (`published`,`created`);--> statement-breakpoint
CREATE TABLE `reader_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`body` text NOT NULL,
	`created` integer NOT NULL,
	`read_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_reader_messages_recipient_created` ON `reader_messages` (`recipient`,`created`);--> statement-breakpoint
CREATE TABLE `site_visits` (
	`visitor` text NOT NULL,
	`day` text NOT NULL,
	`user_id` text,
	`views` integer NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`visitor`, `day`)
);
--> statement-breakpoint
CREATE INDEX `idx_site_visits_day` ON `site_visits` (`day`);--> statement-breakpoint
CREATE INDEX `idx_site_visits_user` ON `site_visits` (`user_id`);