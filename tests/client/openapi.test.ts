import { describe, it, expect } from "vitest";
import { generateOpenApiDocument } from "../../src/client/openapi";

describe("OpenAPI Document Generation", () => {
    it("should generate a valid OpenAPI document", () => {
        const document = generateOpenApiDocument();
        
        // Check basic OpenAPI structure
        expect(document).toBeDefined();
        expect(document.openapi).toBe("3.0.0");
        expect(document.info).toBeDefined();
        expect(document.info.version).toBe("2.0.0");
        expect(document.info.title).toBe("Hennos API");
        expect(document.paths).toBeDefined();
    });

    it("should include all main endpoint paths", () => {
        const document = generateOpenApiDocument();
        
        // Check that all major paths are present
        expect(document.paths["/healthz"]).toBeDefined();
        expect(document.paths["/hennos/conversation/{sessionId}"]).toBeDefined();
        expect(document.paths["/{agent}/conversation/{sessionId}/stream"]).toBeDefined();
        expect(document.paths["/hennos/conversation/{sessionId}/message"]).toBeDefined();
        expect(document.paths["/hennos/conversation/{sessionId}/tools"]).toBeDefined();
        expect(document.paths["/hennos/conversation/{sessionId}/artifact"]).toBeDefined();
        expect(document.paths["/hennos/conversation/{sessionId}/context"]).toBeDefined();
        expect(document.paths["/gemstone/conversation/{sessionId}/message"]).toBeDefined();
        expect(document.paths["/legacy/conversation/{sessionId}/message"]).toBeDefined();
    });

    it("should include proper HTTP methods for endpoints", () => {
        const document = generateOpenApiDocument();
        
        // Check GET endpoints
        expect(document.paths["/healthz"].get).toBeDefined();
        expect(document.paths["/hennos/conversation/{sessionId}"].get).toBeDefined();
        expect(document.paths["/{agent}/conversation/{sessionId}/stream"].get).toBeDefined();
        
        // Check POST endpoints
        expect(document.paths["/hennos/conversation/{sessionId}/message"].post).toBeDefined();
        expect(document.paths["/hennos/conversation/{sessionId}/tools"].post).toBeDefined();
        expect(document.paths["/hennos/conversation/{sessionId}/context"].post).toBeDefined();
        
        // Check DELETE endpoints
        expect(document.paths["/hennos/conversation/{sessionId}"].delete).toBeDefined();
    });

    it("should include proper tags", () => {
        const document = generateOpenApiDocument();
        
        expect(document.tags).toBeDefined();
        expect(document.tags?.length).toBeGreaterThan(0);
        
        const tagNames = document.tags?.map(tag => tag.name);
        expect(tagNames).toContain("Health");
        expect(tagNames).toContain("Conversations");
        expect(tagNames).toContain("MCP Tools");
        expect(tagNames).toContain("Session Management");
    });

    it("should include server configuration", () => {
        const document = generateOpenApiDocument();
        
        expect(document.servers).toBeDefined();
        expect(document.servers?.length).toBeGreaterThan(0);
        expect(document.servers?.[0].url).toBe("http://localhost:16006");
        expect(document.servers?.[0].description).toBe("Development server");
    });

    it("should include response schemas", () => {
        const document = generateOpenApiDocument();
        
        const messageEndpoint = document.paths["/hennos/conversation/{sessionId}/message"].post;
        expect(messageEndpoint?.responses).toBeDefined();
        expect(messageEndpoint?.responses["200"]).toBeDefined();
        expect(messageEndpoint?.responses["400"]).toBeDefined();
        expect(messageEndpoint?.responses["500"]).toBeDefined();
    });

    it("should include request body schemas", () => {
        const document = generateOpenApiDocument();
        
        const messageEndpoint = document.paths["/hennos/conversation/{sessionId}/message"].post;
        expect(messageEndpoint?.requestBody).toBeDefined();
        expect(messageEndpoint?.requestBody?.content).toBeDefined();
        expect(messageEndpoint?.requestBody?.content["application/json"]).toBeDefined();
    });

    it("should include parameter schemas", () => {
        const document = generateOpenApiDocument();
        
        const conversationEndpoint = document.paths["/hennos/conversation/{sessionId}"].get;
        expect(conversationEndpoint?.parameters).toBeDefined();
        expect(conversationEndpoint?.parameters?.length).toBeGreaterThan(0);
    });
});
