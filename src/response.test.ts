import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentResponseHandler } from "./response";

const PLATFORMS = ["test", "other"];

function workflowId(platform: string, chatId = "0"): string {
    return JSON.stringify({ platform, chatId, type: "legacy" });
}

describe("AgentResponseHandler", () => {
    beforeEach(() => {
        for (const platform of PLATFORMS) {
            AgentResponseHandler.unregisterMessageListener(platform);
            AgentResponseHandler.unregisterArtifactListener(platform);
            AgentResponseHandler.unregisterStatusListener(platform);
        }
    });

    describe("messages", () => {
        it("routes a message to the listener for the workflow's platform", async () => {
            const listener = vi.fn().mockResolvedValue(undefined);
            AgentResponseHandler.registerMessageListener("test", listener);

            await AgentResponseHandler.handleMessage(workflowId("test", "123"), "hello");

            expect(listener).toHaveBeenCalledTimes(1);
            expect(listener).toHaveBeenCalledWith("hello", "123");
        });

        it("only calls the listener registered for the matching platform", async () => {
            const test = vi.fn().mockResolvedValue(undefined);
            const other = vi.fn().mockResolvedValue(undefined);
            AgentResponseHandler.registerMessageListener("test", test);
            AgentResponseHandler.registerMessageListener("other", other);

            await AgentResponseHandler.handleMessage(workflowId("other"), "hi");

            expect(other).toHaveBeenCalledTimes(1);
            expect(test).not.toHaveBeenCalled();
        });

        it("replaces an existing listener when the platform registers again", async () => {
            const first = vi.fn().mockResolvedValue(undefined);
            const second = vi.fn().mockResolvedValue(undefined);
            AgentResponseHandler.registerMessageListener("test", first);
            AgentResponseHandler.registerMessageListener("test", second);

            await AgentResponseHandler.handleMessage(workflowId("test"), "hi");

            expect(first).not.toHaveBeenCalled();
            expect(second).toHaveBeenCalledTimes(1);
        });

        it("stops delivering after unregistering", async () => {
            const listener = vi.fn().mockResolvedValue(undefined);
            AgentResponseHandler.registerMessageListener("test", listener);
            AgentResponseHandler.unregisterMessageListener("test");

            await AgentResponseHandler.handleMessage(workflowId("test"), "hi");

            expect(listener).not.toHaveBeenCalled();
        });

        it("does not throw when no listener is registered for the platform", async () => {
            await expect(AgentResponseHandler.handleMessage(workflowId("test"), "hi")).resolves.toBeUndefined();
        });

        it("does not throw or call listeners for a workflow ID that is not JSON", async () => {
            const listener = vi.fn().mockResolvedValue(undefined);
            AgentResponseHandler.registerMessageListener("test", listener);

            await expect(AgentResponseHandler.handleMessage("not-json", "hi")).resolves.toBeUndefined();

            expect(listener).not.toHaveBeenCalled();
        });

        it("does not call listeners when the workflow ID is missing a platform or chatId", async () => {
            const listener = vi.fn().mockResolvedValue(undefined);
            AgentResponseHandler.registerMessageListener("test", listener);

            await AgentResponseHandler.handleMessage(JSON.stringify({ chatId: "0" }), "hi");
            await AgentResponseHandler.handleMessage(JSON.stringify({ platform: "test" }), "hi");

            expect(listener).not.toHaveBeenCalled();
        });

        it("swallows errors thrown by a listener", async () => {
            AgentResponseHandler.registerMessageListener("test", vi.fn().mockRejectedValue(new Error("boom")));

            await expect(AgentResponseHandler.handleMessage(workflowId("test"), "hi")).resolves.toBeUndefined();
        });
    });

    describe("artifacts", () => {
        it("routes artifacts with their mime type and description", async () => {
            const listener = vi.fn().mockResolvedValue(undefined);
            AgentResponseHandler.registerArtifactListener("test", listener);

            await AgentResponseHandler.handleArtifact(workflowId("test", "7"), "/tmp/image.png", "image/png", "a picture");

            expect(listener).toHaveBeenCalledWith("/tmp/image.png", "7", "image/png", "a picture");
        });

        it("does not throw when no artifact listener is registered", async () => {
            await expect(AgentResponseHandler.handleArtifact(workflowId("test"), "/tmp/file", "text/plain")).resolves.toBeUndefined();
        });
    });

    describe("status events", () => {
        it("routes status events to the platform's status listener", async () => {
            const listener = vi.fn().mockResolvedValue(undefined);
            AgentResponseHandler.registerStatusListener("test", listener);

            await AgentResponseHandler.handleStatus(workflowId("test", "9"), { type: "typing" });

            expect(listener).toHaveBeenCalledWith({ type: "typing" }, "9");
        });

        it("keeps message, artifact and status listeners independent", async () => {
            const message = vi.fn().mockResolvedValue(undefined);
            const status = vi.fn().mockResolvedValue(undefined);
            AgentResponseHandler.registerMessageListener("test", message);
            AgentResponseHandler.registerStatusListener("test", status);

            await AgentResponseHandler.handleStatus(workflowId("test"), { type: "typing" });

            expect(status).toHaveBeenCalledTimes(1);
            expect(message).not.toHaveBeenCalled();
        });
    });
});
