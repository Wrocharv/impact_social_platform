CREATE TABLE IF NOT EXISTS `adminUsers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`name` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`lastSignedIn` timestamp,
	CONSTRAINT `adminUsers_id` PRIMARY KEY(`id`),
	CONSTRAINT `adminUsers_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
INSERT INTO `adminUsers` (`email`, `passwordHash`, `name`)
SELECT 'presidenciarv@hotmail.com', '67f306b538159036a5a32abb947f2be1:ffd6eaa52b0920506e02584173ab4a0aa161b0721cabab0404ce0c668c70ef4d45b6909925c2a99f0d9df057145d5dea31eb9a8078defba3bcecd903813b6947', 'Wellington Rocha'
WHERE NOT EXISTS (SELECT 1 FROM `adminUsers` WHERE `email` = 'presidenciarv@hotmail.com');
