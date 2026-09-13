CREATE TABLE IF NOT EXISTS `monthlyPledgePayments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pledgeId` int NOT NULL,
	`amountCents` int NOT NULL,
	`paidOn` varchar(10) NOT NULL,
	`method` enum('pix','dinheiro','transferencia','cartao','outro') NOT NULL DEFAULT 'pix',
	`note` varchar(255),
	`recordedBy` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monthlyPledgePayments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `monthlyPledges` ADD COLUMN `lastReminderAt` timestamp NULL;
