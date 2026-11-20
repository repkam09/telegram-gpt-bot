-- CreateTable
CREATE TABLE "MemoryExtractionState" (
    "chatId" BIGINT NOT NULL PRIMARY KEY,
    "lastMessageId" INTEGER NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
