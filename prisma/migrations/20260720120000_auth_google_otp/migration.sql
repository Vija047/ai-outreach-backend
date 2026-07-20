-- CreateEnum
CREATE TYPE "AuthProvider" AS ENUM ('EMAIL', 'GOOGLE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "googleId" TEXT,
ADD COLUMN "authProvider" "AuthProvider" NOT NULL DEFAULT 'EMAIL',
ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;

-- Backfill: existing email/password users are verified
UPDATE "User" SET "emailVerified" = true WHERE "passwordHash" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
