-- CreateTable
CREATE TABLE "WorkflowSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "activePlatform" TEXT
);

-- CreateTable
CREATE TABLE "WorkflowSessionLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workflowSessionId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    CONSTRAINT "WorkflowSessionLink_workflowSessionId_fkey" FOREIGN KEY ("workflowSessionId") REFERENCES "WorkflowSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowSessionLink_chatId_platform_key" ON "WorkflowSessionLink"("chatId", "platform");
