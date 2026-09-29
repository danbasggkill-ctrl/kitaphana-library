CREATE TABLE `profile_removals` (
	`user_id` text PRIMARY KEY NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `warning_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`recipient` text NOT NULL,
	`fingerprint` text NOT NULL,
	`warning_count` integer NOT NULL,
	`deleted` integer NOT NULL,
	`created` integer NOT NULL
);
