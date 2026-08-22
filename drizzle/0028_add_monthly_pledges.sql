CREATE TABLE `monthlyPledges` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`cpf` varchar(14) NOT NULL,
	`email` varchar(320),
	`whatsapp` varchar(20) NOT NULL,
	`city` varchar(255),
	`totalAmountCents` int NOT NULL,
	`installments` int NOT NULL,
	`installmentAmountCents` int NOT NULL,
	`installmentsPaid` int NOT NULL DEFAULT 0,
	`reminderDay` int NOT NULL DEFAULT 5,
	`status` enum('active','paused','completed','cancelled') NOT NULL DEFAULT 'active',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monthlyPledges_id` PRIMARY KEY(`id`)
);
