ALTER TABLE contributions
  ADD COLUMN validatedBy INT NULL,
  ADD COLUMN validatedAt TIMESTAMP NULL,
  ADD COLUMN validationNote TEXT NULL;
