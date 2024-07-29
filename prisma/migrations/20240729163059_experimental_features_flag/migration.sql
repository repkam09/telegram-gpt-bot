-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "chatId" BIGINT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "username" TEXT,
    "provider" TEXT,
    "whitelisted" BOOLEAN NOT NULL DEFAULT false,
    "voice" TEXT,
    "preferredName" TEXT,
    "botName" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    "experimental" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_User" ("botName", "chatId", "firstName", "lastName", "latitude", "longitude", "preferredName", "provider", "username", "voice", "whitelisted") SELECT "botName", "chatId", "firstName", "lastName", "latitude", "longitude", "preferredName", "provider", "username", "voice", "whitelisted" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
