ALTER TABLE `contributions` ADD COLUMN `numberOfInstallments` int;
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `installmentFrequency` varchar(50);
--> statement-breakpoint
ALTER TABLE `contributions` ADD COLUMN `materialDeliveryFrequency` varchar(50);
