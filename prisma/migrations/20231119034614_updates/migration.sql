/*
  Warnings:

  - You are about to drop the column `type` on the `Message` table. All the data in the column will be lost.
  - You are about to drop the column `configId` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Config` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `role` to the `Message` table without a default value. This is not possible if the table is not empty.
  - Added the required column `botName` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `name` to the `User` table without a default value. This is not possible if the table is not empty.
  - Added the required column `voice` to the `User` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Role" AS ENUM ('assistant', 'user', 'system');

-- DropIndex
DROP INDEX "User_configId_key";

-- AlterTable
CREATE SEQUENCE message_id_seq;
ALTER TABLE "Message" DROP COLUMN "type",
ADD COLUMN     "name" TEXT,
ADD COLUMN     "role" "Role" NOT NULL,
ALTER COLUMN "id" SET DEFAULT nextval('message_id_seq');
ALTER SEQUENCE message_id_seq OWNED BY "Message"."id";

-- AlterTable
ALTER TABLE "User" DROP COLUMN "configId",
ADD COLUMN     "botName" TEXT NOT NULL,
ADD COLUMN     "name" TEXT NOT NULL,
ADD COLUMN     "voice" TEXT NOT NULL;

-- DropTable
DROP TABLE "Config";

-- DropEnum
DROP TYPE "MessageType";
