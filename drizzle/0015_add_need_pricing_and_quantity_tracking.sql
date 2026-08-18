ALTER TABLE campaignNeeds
  ADD COLUMN targetQuantityExact int NULL,
  ADD COLUMN unitValueCents int NULL;
--> statement-breakpoint
ALTER TABLE contributions
  ADD COLUMN campaignNeedId int NULL,
  ADD COLUMN quantityExact int NULL,
  ADD COLUMN estimatedAmount int NULL;