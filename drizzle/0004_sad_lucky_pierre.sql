CREATE TABLE `library_admins` (
	`user_id` text PRIMARY KEY NOT NULL,
	`granted_by` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reader_book_blocks` (
	`user_id` text NOT NULL,
	`book` text NOT NULL,
	`created` integer NOT NULL,
	`created_by` text NOT NULL,
	PRIMARY KEY(`user_id`, `book`)
);
--> statement-breakpoint
ALTER TABLE `reader_messages` ADD `kind` text DEFAULT 'message' NOT NULL;--> statement-breakpoint
ALTER TABLE `reader_profiles` ADD `middle_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `reader_profiles` ADD `name_key` text;--> statement-breakpoint
CREATE UNIQUE INDEX `reader_profiles_name_key_unique` ON `reader_profiles` (`name_key`);