-- CreateEnum
CREATE TYPE "AnalysisJobStep" AS ENUM ('SCRAPING', 'ENRICHING', 'ANALYZING', 'SAVING');

-- CreateEnum
CREATE TYPE "HookSourceType" AS ENUM ('WEBSITE', 'NEWS');

-- AlterTable
ALTER TABLE "AnalysisJob" ADD COLUMN "step" "AnalysisJobStep",
ADD COLUMN "errorCode" TEXT;

-- AlterTable
ALTER TABLE "CompanyHook" ADD COLUMN "sourceType" "HookSourceType",
ADD COLUMN "excerpt" TEXT;

-- AlterTable
ALTER TABLE "Generation" ADD COLUMN "variants" JSONB;
