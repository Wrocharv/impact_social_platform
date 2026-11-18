CREATE TABLE IF NOT EXISTS `quickCampaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`subtitle` varchar(200),
	`goalCents` int,
	`suggestedTotalCents` int,
	`suggestedInstallments` int,
	`allowCustomAmount` boolean NOT NULL DEFAULT true,
	`pixKey` varchar(140),
	`pixName` varchar(120),
	`status` enum('active','closed') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `quickCampaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `monthlyPledges` ADD COLUMN `quickCampaignId` int NULL;
--> statement-breakpoint
ALTER TABLE `monthlyPledges` ADD COLUMN `downPaymentCents` int NOT NULL DEFAULT 0;
