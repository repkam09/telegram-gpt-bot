-- CreateTable
CREATE TABLE "OpenAI" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatId" BIGINT NOT NULL,
    "api" TEXT NOT NULL,
    "org" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "OpenAI_chatId_key" ON "OpenAI"("chatId");
