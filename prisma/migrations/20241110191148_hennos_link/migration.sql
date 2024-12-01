-- CreateTable
CREATE TABLE "HennosLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatId" BIGINT NOT NULL,
    "link" TEXT NOT NULL,
    "datetime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "HennosLink_chatId_key" ON "HennosLink"("chatId");

-- CreateIndex
CREATE UNIQUE INDEX "HennosLink_link_key" ON "HennosLink"("link");
