ALTER TABLE `campaignExpenses` ADD COLUMN `publishedAt` timestamp NULL;
--> statement-breakpoint
UPDATE `campaignExpenses` SET `publishedAt` = `createdAt` WHERE `publishedAt` IS NULL;
--> statement-breakpoint
ALTER TABLE `transparencyDocuments` ADD COLUMN `publishedAt` timestamp NULL;
--> statement-breakpoint
UPDATE `transparencyDocuments` SET `publishedAt` = `uploadedAt` WHERE `publishedAt` IS NULL;
