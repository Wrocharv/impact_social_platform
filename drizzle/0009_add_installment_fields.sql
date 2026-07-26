ALTER TABLE `contributions` ADD COLUMN `numberOfInstallments` int;
ALTER TABLE `contributions` ADD COLUMN `installmentFrequency` varchar(50);
ALTER TABLE `contributions` ADD COLUMN `materialDeliveryFrequency` varchar(50);
