CREATE TABLE `campaignExpenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`category` enum('materials','labor','equipment','services','transport','fees','other') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`amount` int NOT NULL,
	`expenseDate` timestamp NOT NULL,
	`documentId` int,
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaignExpenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `transparencyDocuments` ADD `storageKey` varchar(512);--> statement-breakpoint
ALTER TABLE `transparencyDocuments` ADD `fileName` varchar(255);--> statement-breakpoint
ALTER TABLE `transparencyDocuments` ADD `mimeType` varchar(100);--> statement-breakpoint
ALTER TABLE `transparencyDocuments` ADD `fileSize` int;--> statement-breakpoint
ALTER TABLE `transparencyDocuments` ADD `createdBy` int;