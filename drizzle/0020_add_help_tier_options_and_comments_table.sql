ALTER TABLE `campaigns` ADD COLUMN `helpTierOptions` varchar(64) NOT NULL DEFAULT 'material,financial,vip';
--> statement-breakpoint
CREATE TABLE `campaignComments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`userId` int,
	`authorName` varchar(255),
	`content` text NOT NULL,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaignComments_id` PRIMARY KEY(`id`)
);
