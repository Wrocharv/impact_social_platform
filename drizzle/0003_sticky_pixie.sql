CREATE TABLE `notificationDeliveries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`notificationType` varchar(80) NOT NULL,
	`resourceType` varchar(40) NOT NULL,
	`resourceId` int NOT NULL,
	`recipientEmail` varchar(320) NOT NULL,
	`provider` varchar(40) NOT NULL DEFAULT 'resend',
	`idempotencyKey` varchar(255) NOT NULL,
	`status` enum('processing','sent','failed','skipped') NOT NULL DEFAULT 'processing',
	`attemptCount` int NOT NULL DEFAULT 0,
	`providerMessageId` varchar(255),
	`lastError` text,
	`sentAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationDeliveries_id` PRIMARY KEY(`id`),
	CONSTRAINT `notificationDeliveries_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
