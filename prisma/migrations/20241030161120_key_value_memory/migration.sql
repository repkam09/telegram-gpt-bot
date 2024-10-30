-- CreateTable
CREATE TABLE "KeyValueMemory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatId" BIGINT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "datetime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "KeyValueMemory_chatId_key_key" ON "KeyValueMemory"("chatId", "key");
