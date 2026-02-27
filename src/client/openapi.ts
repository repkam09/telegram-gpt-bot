import { OpenAPIRegistry, OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import {
    sessionIdParamSchema,
    agentParamSchema,
    messageBodySchema,
    mcpServerBodySchema,
    toolIdParamSchema,
    artifactBodySchema,
    successResponseSchema,
    errorResponseSchema,
    conversationHistorySchema,
    mcpServersListSchema
} from "./api-schemas";

// Create the OpenAPI registry
const registry = new OpenAPIRegistry();

// Health check endpoint
registry.registerPath({
    method: "get",
    path: "/healthz",
    summary: "Health check endpoint",
    description: "Returns 200 OK if the service is healthy",
    responses: {
        200: {
            description: "Service is healthy",
            content: {
                "text/plain": {
                    schema: {
                        type: "string",
                        example: "OK"
                    }
                }
            }
        }
    },
    tags: ["Health"]
});

// Get conversation history
registry.registerPath({
    method: "get",
    path: "/hennos/conversation/{sessionId}",
    summary: "Get conversation history",
    description: "Fetch conversation history for a session (max 250 messages)",
    request: {
        params: sessionIdParamSchema
    },
    responses: {
        200: {
            description: "Conversation history",
            content: {
                "application/json": {
                    schema: conversationHistorySchema
                }
            }
        },
        400: {
            description: "Bad request - invalid or missing sessionId",
            content: {
                "text/plain": {
                    schema: {
                        type: "string",
                        example: "Missing sessionId"
                    }
                }
            }
        }
    },
    tags: ["Conversations"]
});

// SSE streaming endpoint
registry.registerPath({
    method: "get",
    path: "/{agent}/conversation/{sessionId}/stream",
    summary: "SSE streaming endpoint",
    description: "Establishes a Server-Sent Events stream for real-time messages",
    request: {
        params: agentParamSchema.merge(sessionIdParamSchema)
    },
    responses: {
        200: {
            description: "SSE stream established",
            content: {
                "text/event-stream": {
                    schema: {
                        type: "string",
                        description: "Server-Sent Events stream"
                    }
                }
            }
        },
        400: {
            description: "Bad request - invalid parameters",
            content: {
                "text/plain": {
                    schema: {
                        type: "string"
                    }
                }
            }
        }
    },
    tags: ["Conversations"]
});

// Send message to hennos conversation
registry.registerPath({
    method: "post",
    path: "/hennos/conversation/{sessionId}/message",
    summary: "Send message to conversation",
    description: "Send a message to the Hennos agent conversation",
    request: {
        params: sessionIdParamSchema,
        body: {
            content: {
                "application/json": {
                    schema: messageBodySchema
                }
            }
        }
    },
    responses: {
        200: {
            description: "Message sent successfully",
            content: {
                "application/json": {
                    schema: successResponseSchema
                }
            }
        },
        400: {
            description: "Bad request - missing required fields",
            content: {
                "text/plain": {
                    schema: {
                        type: "string"
                    }
                }
            }
        },
        500: {
            description: "Internal server error",
            content: {
                "application/json": {
                    schema: errorResponseSchema
                }
            }
        }
    },
    tags: ["Conversations"]
});

// Add MCP server to conversation
registry.registerPath({
    method: "post",
    path: "/hennos/conversation/{sessionId}/tools",
    summary: "Add MCP server to conversation",
    description: "Register a Model Context Protocol server for the conversation",
    request: {
        params: sessionIdParamSchema,
        body: {
            content: {
                "application/json": {
                    schema: mcpServerBodySchema
                }
            }
        }
    },
    responses: {
        200: {
            description: "MCP server added successfully",
            content: {
                "application/json": {
                    schema: successResponseSchema
                }
            }
        },
        400: {
            description: "Bad request - validation failed",
            content: {
                "application/json": {
                    schema: errorResponseSchema
                }
            }
        },
        500: {
            description: "Internal server error",
            content: {
                "application/json": {
                    schema: errorResponseSchema
                }
            }
        }
    },
    tags: ["MCP Tools"]
});

// Get MCP servers for conversation
registry.registerPath({
    method: "get",
    path: "/hennos/conversation/{sessionId}/tools",
    summary: "List MCP servers",
    description: "Get all MCP servers registered for the conversation",
    request: {
        params: sessionIdParamSchema
    },
    responses: {
        200: {
            description: "List of MCP servers",
            content: {
                "application/json": {
                    schema: mcpServersListSchema
                }
            }
        },
        400: {
            description: "Bad request - invalid sessionId",
            content: {
                "text/plain": {
                    schema: {
                        type: "string"
                    }
                }
            }
        }
    },
    tags: ["MCP Tools"]
});

// Delete MCP server (not implemented)
registry.registerPath({
    method: "delete",
    path: "/hennos/conversation/{sessionId}/tools/{toolId}",
    summary: "Remove MCP server (Not Implemented)",
    description: "Remove an MCP server from the conversation",
    request: {
        params: sessionIdParamSchema.merge(toolIdParamSchema)
    },
    responses: {
        501: {
            description: "Not implemented",
            content: {
                "text/plain": {
                    schema: {
                        type: "string",
                        example: "Not Implemented"
                    }
                }
            }
        }
    },
    tags: ["MCP Tools"]
});

// Handle artifact (not implemented)
registry.registerPath({
    method: "post",
    path: "/hennos/conversation/{sessionId}/artifact",
    summary: "Handle artifact (Not Implemented)",
    description: "Process and store an artifact for the conversation",
    request: {
        params: sessionIdParamSchema,
        body: {
            content: {
                "application/json": {
                    schema: artifactBodySchema
                }
            }
        }
    },
    responses: {
        500: {
            description: "Not implemented",
            content: {
                "application/json": {
                    schema: errorResponseSchema
                }
            }
        }
    },
    tags: ["Artifacts"]
});

// Terminate workflow
registry.registerPath({
    method: "delete",
    path: "/hennos/conversation/{sessionId}",
    summary: "Terminate conversation workflow",
    description: "Signal the workflow to exit and clean up resources",
    request: {
        params: sessionIdParamSchema
    },
    responses: {
        200: {
            description: "Workflow terminated successfully",
            content: {
                "application/json": {
                    schema: successResponseSchema
                }
            }
        },
        400: {
            description: "Bad request - invalid sessionId",
            content: {
                "text/plain": {
                    schema: {
                        type: "string"
                    }
                }
            }
        },
        500: {
            description: "Internal server error",
            content: {
                "application/json": {
                    schema: errorResponseSchema
                }
            }
        }
    },
    tags: ["Session Management"]
});

// Update context
registry.registerPath({
    method: "post",
    path: "/hennos/conversation/{sessionId}/context",
    summary: "Update conversation context",
    description: "Add context information to the conversation",
    request: {
        params: sessionIdParamSchema,
        body: {
            content: {
                "application/json": {
                    schema: messageBodySchema
                }
            }
        }
    },
    responses: {
        200: {
            description: "Context updated successfully",
            content: {
                "application/json": {
                    schema: successResponseSchema
                }
            }
        },
        400: {
            description: "Bad request - missing required fields",
            content: {
                "text/plain": {
                    schema: {
                        type: "string"
                    }
                }
            }
        },
        500: {
            description: "Internal server error",
            content: {
                "application/json": {
                    schema: errorResponseSchema
                }
            }
        }
    },
    tags: ["Conversations"]
});

// Gemstone agent message endpoint
registry.registerPath({
    method: "post",
    path: "/gemstone/conversation/{sessionId}/message",
    summary: "Send message to Gemstone agent",
    description: "Send a message to the Gemstone agent conversation",
    request: {
        params: sessionIdParamSchema,
        body: {
            content: {
                "application/json": {
                    schema: messageBodySchema
                }
            }
        }
    },
    responses: {
        200: {
            description: "Message sent successfully",
            content: {
                "application/json": {
                    schema: successResponseSchema
                }
            }
        },
        400: {
            description: "Bad request",
            content: {
                "text/plain": {
                    schema: {
                        type: "string"
                    }
                }
            }
        },
        500: {
            description: "Internal server error",
            content: {
                "application/json": {
                    schema: errorResponseSchema
                }
            }
        }
    },
    tags: ["Conversations"]
});

// Legacy agent message endpoint
registry.registerPath({
    method: "post",
    path: "/legacy/conversation/{sessionId}/message",
    summary: "Send message to Legacy agent",
    description: "Send a message to the Legacy agent conversation",
    request: {
        params: sessionIdParamSchema,
        body: {
            content: {
                "application/json": {
                    schema: messageBodySchema
                }
            }
        }
    },
    responses: {
        200: {
            description: "Message sent successfully",
            content: {
                "application/json": {
                    schema: successResponseSchema
                }
            }
        },
        400: {
            description: "Bad request",
            content: {
                "text/plain": {
                    schema: {
                        type: "string"
                    }
                }
            }
        },
        500: {
            description: "Internal server error",
            content: {
                "application/json": {
                    schema: errorResponseSchema
                }
            }
        }
    },
    tags: ["Conversations"]
});

// Generate the OpenAPI document
export function generateOpenApiDocument() {
    const generator = new OpenApiGeneratorV3(registry.definitions);

    return generator.generateDocument({
        openapi: "3.0.0",
        info: {
            version: "2.0.0",
            title: "Hennos API",
            description: "REST API for the Hennos agentic chatbot system. This API provides endpoints for managing conversations, sending messages, and integrating with MCP (Model Context Protocol) servers.",
            contact: {
                name: "Mark Repka",
            },
            license: {
                name: "MIT",
            }
        },
        servers: [
            {
                url: "http://localhost:16006",
                description: "Development server"
            }
        ],
        tags: [
            { name: "Health", description: "Service health endpoints" },
            { name: "Conversations", description: "Conversation management and messaging" },
            { name: "MCP Tools", description: "Model Context Protocol server management" },
            { name: "Artifacts", description: "Artifact handling (future feature)" },
            { name: "Session Management", description: "Session and workflow management" }
        ]
    });
}
