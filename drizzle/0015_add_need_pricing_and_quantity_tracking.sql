ALTER TABLE campaignNeeds ADD COLUMN targetQuantityExact int NULL;
--> statement-breakpoint
ALTER TABLE campaignNeeds ADD COLUMN unitValueCents int NULL;
--> statement-breakpoint
ALTER TABLE contributions ADD COLUMN campaignNeedId int NULL;
--> statement-breakpoint
ALTER TABLE contributions ADD COLUMN quantityExact int NULL;
--> statement-breakpoint
ALTER TABLE contributions ADD COLUMN estimatedAmount int NULL;