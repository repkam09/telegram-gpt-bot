-- CreateTable
CREATE TABLE "ModelContextProtocolServer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "workflowSessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "transport" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ModelContextProtocolServer_workflowSessionId_fkey" FOREIGN KEY ("workflowSessionId") REFERENCES "WorkflowSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModelContextProtocolServerHeaders" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "serverId" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "ModelContextProtocolServerHeaders_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "ModelContextProtocolServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ModelContextProtocolServer_name_workflowSessionId_key" ON "ModelContextProtocolServer"("name", "workflowSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ModelContextProtocolServerHeaders_serverId_key_key" ON "ModelContextProtocolServerHeaders"("serverId", "key");
