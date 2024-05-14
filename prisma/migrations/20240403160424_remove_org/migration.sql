/*
  Warnings:

  - You are about to drop the column `org` on the `OpenAI` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OpenAI" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatId" BIGINT NOT NULL,
    "api" TEXT NOT NULL
);
INSERT INTO "new_OpenAI" ("api", "chatId", "id") SELECT "api", "chatId", "id" FROM "OpenAI";
DROP TABLE "OpenAI";
ALTER TABLE "new_OpenAI" RENAME TO "OpenAI";
CREATE UNIQUE INDEX "OpenAI_chatId_key" ON "OpenAI"("chatId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
