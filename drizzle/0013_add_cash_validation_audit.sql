ALTER TABLE contributions ADD COLUMN validatedBy INT NULL;
--> statement-breakpoint
ALTER TABLE contributions ADD COLUMN validatedAt TIMESTAMP NULL;
--> statement-breakpoint
ALTER TABLE contributions ADD COLUMN validationNote TEXT NULL;
