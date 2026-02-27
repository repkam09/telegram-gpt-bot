import { z } from "zod";
import { extendZodWithOpenApi } from "@asteasolutions/zod-to-openapi";

// Extend Zod with OpenAPI support
extendZodWithOpenApi(z);

// ====== Request Schemas ======

// Session ID parameter schema
export const sessionIdParamSchema = z.object({
    sessionId: z.string()
        .min(1)
        .openapi({
            description: "Unique session identifier",
            example: "session-123"
        })
});

// Agent parameter schema
export const agentParamSchema = z.object({
    agent: z.enum(["hennos", "gemstone", "legacy"])
        .openapi({
            description: "Agent type",
            example: "hennos"
        })
});

// Message request body schema
export const messageBodySchema = z.object({
    message: z.string()
        .min(1)
        .openapi({
            description: "The message content to send",
            example: "Hello, how can you help me?"
        }),
    author: z.string()
        .min(1)
        .openapi({
            description: "Author identifier (username or user ID)",
            example: "user123"
        })
});

// MCP server header schema
export const mcpHeaderSchema = z.object({
    key: z.string()
        .openapi({
            description: "Header key",
            example: "Authorization"
        }),
    value: z.string()
        .openapi({
            description: "Header value",
            example: "Bearer token123"
        })
});

// MCP server body schema
export const mcpServerBodySchema = z.object({
    name: z.string()
        .min(1)
        .openapi({
            description: "MCP server name",
            example: "my-mcp-server"
        }),
    url: z.string()
        .url()
        .openapi({
            description: "MCP server URL",
            example: "https://api.example.com/mcp"
        }),
    transport: z.string()
        .openapi({
            description: "Transport protocol",
            example: "http"
        }),
    headers: z.array(mcpHeaderSchema)
        .openapi({
            description: "HTTP headers for the MCP server"
        })
});

// Tool ID parameter schema
export const toolIdParamSchema = z.object({
    toolId: z.string()
        .min(1)
        .openapi({
            description: "Tool identifier",
            example: "tool-456"
        })
});

// Artifact body schema (for future implementation)
export const artifactBodySchema = z.object({
    author: z.string()
        .min(1)
        .openapi({
            description: "Author identifier",
            example: "user123"
        })
    // Additional fields will be added when artifact endpoint is implemented
});

// ====== Response Schemas ======

// Success response schema
export const successResponseSchema = z.object({
    status: z.literal("ok")
        .openapi({
            description: "Success status",
            example: "ok"
        })
});

// Error response schema
export const errorResponseSchema = z.object({
    status: z.literal("error")
        .openapi({
            description: "Error status",
            example: "error"
        }),
    message: z.string()
        .openapi({
            description: "Error message",
            example: "error sending message"
        }),
    details: z.string()
        .optional()
        .openapi({
            description: "Detailed error information",
            example: "Connection timeout"
        })
});

// Conversation history entry schema
export const conversationEntrySchema = z.object({
    content: z.string()
        .openapi({
            description: "Message content",
            example: "Hello!"
        }),
    role: z.string()
        .openapi({
            description: "Message role (user, assistant, system)",
            example: "user"
        }),
    user: z.string()
        .openapi({
            description: "User identifier",
            example: "user123"
        }),
    date: z.date()
        .openapi({
            description: "Message timestamp",
            example: new Date("2024-01-01T00:00:00Z")
        })
});

// Conversation history response schema
export const conversationHistorySchema = z.array(conversationEntrySchema)
    .openapi({
        description: "Array of conversation messages"
    });

// MCP server info schema
export const mcpServerInfoSchema = z.object({
    id: z.string()
        .openapi({
            description: "Server ID",
            example: "srv-123"
        }),
    name: z.string()
        .openapi({
            description: "Server name",
            example: "my-mcp-server"
        }),
    transport: z.string()
        .openapi({
            description: "Transport protocol",
            example: "http"
        }),
    url: z.string()
        .openapi({
            description: "Server URL",
            example: "https://api.example.com/mcp"
        }),
    createdAt: z.date()
        .openapi({
            description: "Creation timestamp",
            example: new Date("2024-01-01T00:00:00Z")
        }),
    mcpserverHeaders: z.array(mcpHeaderSchema)
        .openapi({
            description: "Server headers"
        })
});

// MCP servers list response schema
export const mcpServersListSchema = z.object({
    mcp: z.array(mcpServerInfoSchema)
        .openapi({
            description: "Array of MCP servers"
        })
});
