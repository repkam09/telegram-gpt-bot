import { describe, it, expect, beforeEach } from "vitest";
import { AgentResponseHandler } from "../src/response";

describe("AgentResponseHandler", () => {
    beforeEach(() => {
        AgentResponseHandler["listeners"].clear();
        AgentResponseHandler["artifactListeners"].clear();
    });

    describe("handle", () => {
        it("should route messages to correct platform listener", async () => {
            const results: Array<{ platform: string; message: string; chatId: string }> = [];

            AgentResponseHandler.registerListener("telegram", async (message: string, chatId: string) => {
                results.push({ platform: "telegram", message, chatId });
            });

            AgentResponseHandler.registerListener("discord", async (message: string, chatId: string) => {
                results.push({ platform: "discord", message, chatId });
            });

            await AgentResponseHandler.handle("{\"platform\":\"telegram\",\"chatId\":\"123\"}", "Telegram message");
            await AgentResponseHandler.handle("{\"platform\":\"discord\",\"chatId\":\"456\"}", "Discord message");

            expect(results).toHaveLength(2);
            expect(results[0]).toEqual({ platform: "telegram", message: "Telegram message", chatId: "123" });
            expect(results[1]).toEqual({ platform: "discord", message: "Discord message", chatId: "456" });
        });

        it("should not throw when no listener is registered", async () => {
            await expect(
                AgentResponseHandler.handle("{\"platform\":\"unknown\",\"chatId\":\"123\"}", "Test message")
            ).resolves.not.toThrow();
        });
    });

    describe("handleArtifact", () => {
        it("should route artifacts to correct platform listener", async () => {
            const telegramArtifacts: string[] = [];
            const discordArtifacts: string[] = [];

            AgentResponseHandler.registerArtifactListener("telegram", async (filePath) => {
                telegramArtifacts.push(filePath);
            });

            AgentResponseHandler.registerArtifactListener("discord", async (filePath) => {
                discordArtifacts.push(filePath);
            });

            await AgentResponseHandler.handleArtifact("{\"platform\":\"telegram\",\"chatId\":\"123\"}", "/telegram/file.txt");
            await AgentResponseHandler.handleArtifact("{\"platform\":\"discord\",\"chatId\":\"456\"}", "/discord/file.txt");

            expect(telegramArtifacts).toEqual(["/telegram/file.txt"]);
            expect(discordArtifacts).toEqual(["/discord/file.txt"]);
        });

        it("should pass optional description parameter", async () => {
            let receivedDescription: string | undefined = "initial";

            AgentResponseHandler.registerArtifactListener("telegram", async (_filePath: string, _chatId: string, description?: string) => {
                receivedDescription = description;
            });

            await AgentResponseHandler.handleArtifact("{\"platform\":\"telegram\",\"chatId\":\"123\"}", "/path/to/file.txt");
            expect(receivedDescription).toBeUndefined();

            await AgentResponseHandler.handleArtifact("{\"platform\":\"telegram\",\"chatId\":\"123\"}", "/path/to/file.txt", "Test");
            expect(receivedDescription).toBe("Test");
        });

        it("should not throw when no artifact listener is registered", async () => {
            await expect(
                AgentResponseHandler.handleArtifact("{\"platform\":\"unknown\",\"chatId\":\"123\"}", "/path/to/file")
            ).resolves.not.toThrow();
        });
    });
});
