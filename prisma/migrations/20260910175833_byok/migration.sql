-- CreateTable
CREATE TABLE "UserBYOK" (
    "chatId" BIGINT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "datetime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "UserBYOK_chatId_key_key" ON "UserBYOK"("chatId", "key");
