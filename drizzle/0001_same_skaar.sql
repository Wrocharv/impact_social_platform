CREATE TABLE `ambassadors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`personalLink` varchar(255) NOT NULL,
	`totalRaised` int NOT NULL DEFAULT 0,
	`ranking` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ambassadors_id` PRIMARY KEY(`id`),
	CONSTRAINT `ambassadors_userId_unique` UNIQUE(`userId`),
	CONSTRAINT `ambassadors_personalLink_unique` UNIQUE(`personalLink`)
);
--> statement-breakpoint
CREATE TABLE `campaignNeeds` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`type` enum('material','labor','equipment','other') NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`quantity` varchar(100),
	`priority` enum('high','medium','low') NOT NULL DEFAULT 'medium',
	`fulfilled` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaignNeeds_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaignUpdates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`imageUrls` text,
	`videoUrls` text,
	`phase` enum('before','during','after') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaignUpdates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text NOT NULL,
	`longDescription` text,
	`goal` int NOT NULL,
	`raised` int NOT NULL DEFAULT 0,
	`status` enum('active','completed','paused','archived') NOT NULL DEFAULT 'active',
	`imageUrl` varchar(512),
	`createdBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`startDate` timestamp,
	`endDate` timestamp,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `contributions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`userId` int,
	`type` enum('financial','material','volunteer') NOT NULL,
	`amount` int,
	`description` text,
	`donorName` varchar(255),
	`donorEmail` varchar(320),
	`status` enum('pending','approved','completed','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `contributions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `partners` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` enum('company','individual') NOT NULL,
	`description` text,
	`logoUrl` varchar(512),
	`website` varchar(512),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `partners_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transparencyDocuments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`type` enum('invoice','receipt','report','other') NOT NULL,
	`title` varchar(255) NOT NULL,
	`description` text,
	`documentUrl` varchar(512) NOT NULL,
	`amount` int,
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transparencyDocuments_id` PRIMARY KEY(`id`)
);
