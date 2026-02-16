/*
  Warnings:

  - You are about to drop the column `userId` on the `WorkflowMessage` table. All the data in the column will be lost.
  - Added the required column `name` to the `WorkflowMessage` table without a default value. This is not possible if the table is not empty.

*/
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
