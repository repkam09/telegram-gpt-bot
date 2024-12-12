-- CreateTable
CREATE TABLE "FutureTask" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatId" BIGINT NOT NULL,
    "trigger" DATETIME NOT NULL,
    "message" TEXT NOT NULL
);
