import { describe, it, expect } from "vitest";
import {
    sessionIdParamSchema,
    agentParamSchema,
    messageBodySchema,
    mcpServerBodySchema,
    mcpHeaderSchema,
    artifactBodySchema,
    successResponseSchema,
    errorResponseSchema,
    conversationEntrySchema,
    mcpServerInfoSchema
} from "../../src/client/api-schemas";

describe("API Schema Validation", () => {
    describe("sessionIdParamSchema", () => {
        it("should accept valid sessionId", () => {
            const result = sessionIdParamSchema.parse({ sessionId: "session-123" });
            expect(result.sessionId).toBe("session-123");
        });

        it("should reject empty sessionId", () => {
            expect(() => sessionIdParamSchema.parse({ sessionId: "" })).toThrow();
        });

        it("should reject missing sessionId", () => {
            expect(() => sessionIdParamSchema.parse({})).toThrow();
        });
    });

    describe("agentParamSchema", () => {
        it("should accept valid agent types", () => {
            expect(agentParamSchema.parse({ agent: "hennos" }).agent).toBe("hennos");
            expect(agentParamSchema.parse({ agent: "gemstone" }).agent).toBe("gemstone");
            expect(agentParamSchema.parse({ agent: "legacy" }).agent).toBe("legacy");
        });

        it("should reject invalid agent type", () => {
            expect(() => agentParamSchema.parse({ agent: "invalid" })).toThrow();
        });

        it("should reject missing agent", () => {
            expect(() => agentParamSchema.parse({})).toThrow();
        });
    });

    describe("messageBodySchema", () => {
        it("should accept valid message body", () => {
            const result = messageBodySchema.parse({
                message: "Hello, world!",
                author: "user123"
            });
            expect(result.message).toBe("Hello, world!");
            expect(result.author).toBe("user123");
        });

        it("should reject empty message", () => {
            expect(() => messageBodySchema.parse({
                message: "",
                author: "user123"
            })).toThrow();
        });

        it("should reject empty author", () => {
            expect(() => messageBodySchema.parse({
                message: "Hello",
                author: ""
            })).toThrow();
        });

        it("should reject missing message", () => {
            expect(() => messageBodySchema.parse({
                author: "user123"
            })).toThrow();
        });

        it("should reject missing author", () => {
            expect(() => messageBodySchema.parse({
                message: "Hello"
            })).toThrow();
        });
    });

    describe("mcpHeaderSchema", () => {
        it("should accept valid header", () => {
            const result = mcpHeaderSchema.parse({
                key: "Authorization",
                value: "Bearer token123"
            });
            expect(result.key).toBe("Authorization");
            expect(result.value).toBe("Bearer token123");
        });

        it("should reject missing key", () => {
            expect(() => mcpHeaderSchema.parse({
                value: "Bearer token123"
            })).toThrow();
        });

        it("should reject missing value", () => {
            expect(() => mcpHeaderSchema.parse({
                key: "Authorization"
            })).toThrow();
        });
    });

    describe("mcpServerBodySchema", () => {
        it("should accept valid MCP server configuration", () => {
            const result = mcpServerBodySchema.parse({
                name: "my-server",
                url: "https://api.example.com/mcp",
                transport: "http",
                headers: [
                    { key: "Authorization", value: "Bearer token" }
                ]
            });
            expect(result.name).toBe("my-server");
            expect(result.url).toBe("https://api.example.com/mcp");
            expect(result.transport).toBe("http");
            expect(result.headers).toHaveLength(1);
        });

        it("should accept empty headers array", () => {
            const result = mcpServerBodySchema.parse({
                name: "my-server",
                url: "https://api.example.com/mcp",
                transport: "http",
                headers: []
            });
            expect(result.headers).toHaveLength(0);
        });

        it("should reject invalid URL", () => {
            expect(() => mcpServerBodySchema.parse({
                name: "my-server",
                url: "not-a-url",
                transport: "http",
                headers: []
            })).toThrow();
        });

        it("should reject empty name", () => {
            expect(() => mcpServerBodySchema.parse({
                name: "",
                url: "https://api.example.com/mcp",
                transport: "http",
                headers: []
            })).toThrow();
        });

        it("should reject missing transport", () => {
            expect(() => mcpServerBodySchema.parse({
                name: "my-server",
                url: "https://api.example.com/mcp",
                headers: []
            })).toThrow();
        });
    });

    describe("artifactBodySchema", () => {
        it("should accept valid artifact body", () => {
            const result = artifactBodySchema.parse({
                author: "user123"
            });
            expect(result.author).toBe("user123");
        });

        it("should reject empty author", () => {
            expect(() => artifactBodySchema.parse({
                author: ""
            })).toThrow();
        });

        it("should reject missing author", () => {
            expect(() => artifactBodySchema.parse({})).toThrow();
        });
    });

    describe("successResponseSchema", () => {
        it("should accept valid success response", () => {
            const result = successResponseSchema.parse({
                status: "ok"
            });
            expect(result.status).toBe("ok");
        });

        it("should reject invalid status", () => {
            expect(() => successResponseSchema.parse({
                status: "success"
            })).toThrow();
        });
    });

    describe("errorResponseSchema", () => {
        it("should accept valid error response with details", () => {
            const result = errorResponseSchema.parse({
                status: "error",
                message: "Something went wrong",
                details: "Connection timeout"
            });
            expect(result.status).toBe("error");
            expect(result.message).toBe("Something went wrong");
            expect(result.details).toBe("Connection timeout");
        });

        it("should accept error response without details", () => {
            const result = errorResponseSchema.parse({
                status: "error",
                message: "Something went wrong"
            });
            expect(result.status).toBe("error");
            expect(result.message).toBe("Something went wrong");
            expect(result.details).toBeUndefined();
        });

        it("should reject invalid status", () => {
            expect(() => errorResponseSchema.parse({
                status: "fail",
                message: "Something went wrong"
            })).toThrow();
        });

        it("should reject missing message", () => {
            expect(() => errorResponseSchema.parse({
                status: "error"
            })).toThrow();
        });
    });

    describe("conversationEntrySchema", () => {
        it("should accept valid conversation entry", () => {
            const date = new Date("2024-01-01T00:00:00Z");
            const result = conversationEntrySchema.parse({
                content: "Hello!",
                role: "user",
                user: "user123",
                date: date
            });
            expect(result.content).toBe("Hello!");
            expect(result.role).toBe("user");
            expect(result.user).toBe("user123");
            expect(result.date).toEqual(date);
        });

        it("should reject missing content", () => {
            expect(() => conversationEntrySchema.parse({
                role: "user",
                user: "user123",
                date: new Date()
            })).toThrow();
        });

        it("should reject invalid date", () => {
            expect(() => conversationEntrySchema.parse({
                content: "Hello!",
                role: "user",
                user: "user123",
                date: "not-a-date"
            })).toThrow();
        });
    });

    describe("mcpServerInfoSchema", () => {
        it("should accept valid MCP server info", () => {
            const createdAt = new Date("2024-01-01T00:00:00Z");
            const result = mcpServerInfoSchema.parse({
                id: "srv-123",
                name: "my-server",
                transport: "http",
                url: "https://api.example.com/mcp",
                createdAt: createdAt,
                mcpserverHeaders: [
                    { key: "Authorization", value: "Bearer token" }
                ]
            });
            expect(result.id).toBe("srv-123");
            expect(result.name).toBe("my-server");
            expect(result.transport).toBe("http");
            expect(result.url).toBe("https://api.example.com/mcp");
            expect(result.createdAt).toEqual(createdAt);
            expect(result.mcpserverHeaders).toHaveLength(1);
        });

        it("should accept empty headers array", () => {
            const result = mcpServerInfoSchema.parse({
                id: "srv-123",
                name: "my-server",
                transport: "http",
                url: "https://api.example.com/mcp",
                createdAt: new Date(),
                mcpserverHeaders: []
            });
            expect(result.mcpserverHeaders).toHaveLength(0);
        });
    });
});
