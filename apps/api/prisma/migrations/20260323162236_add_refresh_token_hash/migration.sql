/*
  Warnings:

  - A unique constraint covering the columns `[tokenHash]` on the table `RefreshToken` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "tokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");
