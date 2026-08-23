ALTER TABLE `siteSettings` ADD COLUMN `monthlyGivingPopupEnabled` boolean NOT NULL DEFAULT false;
--> statement-breakpoint
ALTER TABLE `siteSettings` ADD COLUMN `monthlyGivingPopupTitle` varchar(150) DEFAULT 'Seja um Parceiro Mensal';
--> statement-breakpoint
ALTER TABLE `siteSettings` ADD COLUMN `monthlyGivingPopupDescription` text;
--> statement-breakpoint
ALTER TABLE `siteSettings` ADD COLUMN `monthlyGivingPopupButtonLabel` varchar(100) DEFAULT 'Quero contribuir todo mês';
--> statement-breakpoint
ALTER TABLE `siteSettings` ADD COLUMN `monthlyGivingPopupCampaignId` int;
