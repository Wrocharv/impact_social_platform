CREATE TABLE `paymentWebhookEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(40) NOT NULL DEFAULT 'mercado_pago',
	`eventKey` varchar(255) NOT NULL,
	`requestId` varchar(255),
	`paymentId` varchar(80) NOT NULL,
	`action` varchar(100),
	`payloadHash` varchar(64) NOT NULL,
	`status` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
	`errorMessage` text,
	`processedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `paymentWebhookEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `paymentWebhookEvents_eventKey_unique` UNIQUE(`eventKey`)
);
--> statement-breakpoint
ALTER TABLE `contributions` MODIFY COLUMN `status` enum('pending','approved','completed','rejected','cancelled','refunded') NOT NULL DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `contributions` ADD `externalReference` varchar(80);--> statement-breakpoint
ALTER TABLE `contributions` ADD `preferenceId` varchar(255);--> statement-breakpoint
ALTER TABLE `contributions` ADD `paymentId` varchar(80);--> statement-breakpoint
ALTER TABLE `contributions` ADD `paymentStatusDetail` varchar(255);--> statement-breakpoint
ALTER TABLE `contributions` ADD `paymentMethod` varchar(100);--> statement-breakpoint
ALTER TABLE `contributions` ADD `currency` varchar(3) DEFAULT 'BRL' NOT NULL;--> statement-breakpoint
ALTER TABLE `contributions` ADD `paidAt` timestamp;--> statement-breakpoint
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_externalReference_unique` UNIQUE(`externalReference`);--> statement-breakpoint
ALTER TABLE `contributions` ADD CONSTRAINT `contributions_paymentId_unique` UNIQUE(`paymentId`);