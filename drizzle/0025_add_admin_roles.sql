ALTER TABLE `adminUsers` ADD COLUMN `role` enum('owner','full','partial') NOT NULL DEFAULT 'full';
--> statement-breakpoint
ALTER TABLE `adminUsers` ADD COLUMN `allowedSections` varchar(255);
--> statement-breakpoint
UPDATE `adminUsers` SET `role` = 'owner' WHERE `email` = 'presidenciarv@hotmail.com';
