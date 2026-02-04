/*
  Warnings:

  - You are about to drop the `FutureTask` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Group` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `HennosLink` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `KeyValueMemory` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the column `userId` on the `WorkflowMessage` table. All the data in the column will be lost.
  - Added the required column `name` to the `WorkflowMessage` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "HennosLink_link_key";

-- DropIndex
DROP INDEX "HennosLink_chatId_key";

-- DropIndex
DROP INDEX "KeyValueMemory_chatId_key_key";

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "FutureTask";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Group";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "HennosLink";
PRAGMA foreign_keys=on;

-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "KeyValueMemory";
PRAGMA foreign_keys=on;

-- CreateTable
CREATE TABLE "WorkflowChat" (
    "id" TEXT NOT NULL PRIMARY KEY
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_WorkflowMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "datetime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT NOT NULL
);
INSERT INTO "new_WorkflowMessage" ("content", "datetime", "id", "role", "type", "workflowId") SELECT "content", "datetime", "id", "role", "type", "workflowId" FROM "WorkflowMessage";
DROP TABLE "WorkflowMessage";
ALTER TABLE "new_WorkflowMessage" RENAME TO "WorkflowMessage";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
