-- CreateEnum
CREATE TYPE "ContactSource" AS ENUM ('NINJAPEARL', 'HUNTER', 'BOTH');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('valid', 'accept_all', 'risky', 'invalid', 'unknown');

-- CreateEnum
CREATE TYPE "ReplyOutcome" AS ENUM ('PENDING', 'YES', 'NO');

-- AlterEnum
ALTER TYPE "AnalysisJobStep" ADD VALUE 'DISCOVERING_CONTACTS';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN "linkedinCompanyUrl" TEXT,
ADD COLUMN "contactsFetchedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CompanyContact" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "linkedinUrl" TEXT,
    "profilePicUrl" TEXT,
    "email" TEXT,
    "emailConfidence" INTEGER,
    "emailStatus" "EmailStatus" NOT NULL DEFAULT 'unknown',
    "source" "ContactSource" NOT NULL,
    "sourceNote" TEXT NOT NULL,
    "rankScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyContact_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Generation" ADD COLUMN "contactId" TEXT,
ADD COLUMN "sentAt" TIMESTAMP(3),
ADD COLUMN "replyOutcome" "ReplyOutcome",
ADD COLUMN "repliedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "CompanyContact_companyId_idx" ON "CompanyContact"("companyId");

-- CreateIndex
CREATE INDEX "Generation_contactId_idx" ON "Generation"("contactId");

-- AddForeignKey
ALTER TABLE "CompanyContact" ADD CONSTRAINT "CompanyContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Generation" ADD CONSTRAINT "Generation_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CompanyContact"("id") ON DELETE SET NULL ON UPDATE CASCADE;
