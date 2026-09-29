CREATE TABLE `quiz_scores` (
	`visitor` text NOT NULL,
	`book` text NOT NULL,
	`score` integer NOT NULL,
	`updated` integer NOT NULL,
	PRIMARY KEY(`visitor`, `book`)
);
