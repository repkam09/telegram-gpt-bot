-- CreateTable
CREATE TABLE "WorkflowMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflowId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "datetime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "role" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowMessage_userId_key" ON "WorkflowMessage"("userId");
