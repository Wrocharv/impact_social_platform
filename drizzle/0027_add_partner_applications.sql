CREATE TABLE `partnerApplications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('company','individual') NOT NULL DEFAULT 'company',
	`companyName` varchar(255) NOT NULL,
	`segment` varchar(255),
	`contactName` varchar(255),
	`phone` varchar(30) NOT NULL,
	`email` varchar(320),
	`offer` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `partnerApplications_id` PRIMARY KEY(`id`)
);
