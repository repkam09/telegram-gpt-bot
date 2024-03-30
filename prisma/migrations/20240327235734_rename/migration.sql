/*
  Warnings:

  - You are about to drop the column `customBotName` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `customName` on the `User` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "chatId" BIGINT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "username" TEXT,
    "whitelisted" BOOLEAN NOT NULL DEFAULT false,
    "voice" TEXT,
    "preferredName" TEXT,
    "botName" TEXT
);
INSERT INTO "new_User" ("chatId", "firstName", "lastName", "username", "voice", "whitelisted") SELECT "chatId", "firstName", "lastName", "username", "voice", "whitelisted" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
