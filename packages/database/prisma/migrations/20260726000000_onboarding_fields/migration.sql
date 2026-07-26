ALTER TABLE "restaurants"
  ADD COLUMN "country" TEXT,
  ADD COLUMN "city" TEXT,
  ADD COLUMN "defaultLanguage" TEXT NOT NULL DEFAULT 'en',
  ADD COLUMN "businessType" TEXT,
  ADD COLUMN "branchCount" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "fiscalWeekStart" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "taxHandling" TEXT NOT NULL DEFAULT 'exclusive';

ALTER TABLE "branches" ADD COLUMN "openingDate" DATE;
