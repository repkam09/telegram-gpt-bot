-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('assistant', 'user', 'system', 'function');

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL,
    "configId" INTEGER NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "MessageType" NOT NULL,
    "content" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Config" (
    "id" SERIAL NOT NULL,
    "voice" TEXT NOT NULL,
    "botName" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Config_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_configId_key" ON "User"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "Config_userId_key" ON "Config"("userId");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
