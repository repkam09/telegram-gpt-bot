/*
  Warnings:

  - You are about to drop the `Settings` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "customBotName" TEXT;
ALTER TABLE "User" ADD COLUMN "customName" TEXT;
ALTER TABLE "User" ADD COLUMN "voice" TEXT;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Settings";
PRAGMA foreign_keys=on;
