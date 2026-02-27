# OpenAPI Documentation

## Overview

This project now includes OpenAPI 3.0 specification generation for all REST API endpoints. The API documentation is automatically generated from Zod validation schemas and is available when the server is running in development mode.

## Accessing the Documentation

When `HENNOS_DEVELOPMENT_MODE=true` and `HENNOS_API_ENABLED=true` in your environment configuration, the following endpoints are available:

- **OpenAPI JSON Spec**: `http://localhost:16006/openapi.json`
- **Swagger UI**: `http://localhost:16006/api-docs`

## Features

### Zod Schema Validation

All API endpoints now use [Zod](https://github.com/colinhacks/zod) for request validation instead of custom inline validation. This provides:

- Type-safe validation with automatic TypeScript type inference
- Clear error messages with validation details
- Consistent validation across all endpoints
- Single source of truth for request/response schemas

### OpenAPI Specification

The OpenAPI spec is automatically generated from the Zod schemas using [@asteasolutions/zod-to-openapi](https://github.com/asteasolutions/zod-to-openapi). This ensures:

- Documentation always matches the actual validation logic
- No manual maintenance of API docs required
- Interactive API testing via Swagger UI

### Development Mode Only

For security and performance reasons, the OpenAPI documentation endpoints are **only available when `HENNOS_DEVELOPMENT_MODE=true`**. In production, these endpoints are not exposed.

## API Endpoints Documented

The following endpoints are included in the OpenAPI specification:

### Health & Status
- `GET /healthz` - Health check

### Conversations
- `GET /hennos/conversation/{sessionId}` - Get conversation history
- `GET /{agent}/conversation/{sessionId}/stream` - SSE streaming endpoint
- `POST /hennos/conversation/{sessionId}/message` - Send message
- `POST /hennos/conversation/{sessionId}/context` - Update conversation context
- `POST /gemstone/conversation/{sessionId}/message` - Send message to Gemstone agent
- `POST /legacy/conversation/{sessionId}/message` - Send message to Legacy agent

### MCP Tools
- `POST /hennos/conversation/{sessionId}/tools` - Add MCP server
- `GET /hennos/conversation/{sessionId}/tools` - List MCP servers
- `DELETE /hennos/conversation/{sessionId}/tools/{toolId}` - Remove MCP server

### Session Management
- `DELETE /hennos/conversation/{sessionId}` - Terminate workflow

### Artifacts (Future)
- `POST /hennos/conversation/{sessionId}/artifact` - Handle artifacts

## Request/Response Schemas

All request and response schemas are defined in `src/client/api-schemas.ts`:

- `sessionIdParamSchema` - Session ID path parameter
- `agentParamSchema` - Agent type parameter (hennos, gemstone, legacy)
- `messageBodySchema` - Message request body (message + author)
- `mcpServerBodySchema` - MCP server configuration
- `successResponseSchema` - Success response
- `errorResponseSchema` - Error response with details
- `conversationHistorySchema` - Conversation history response
- `mcpServersListSchema` - MCP servers list response

## Example Usage

### Sending a Message

```bash
curl -X POST http://localhost:16006/hennos/conversation/my-session/message \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Hello, how can you help me?",
    "author": "user123"
  }'
```

### Getting Conversation History

```bash
curl http://localhost:16006/hennos/conversation/my-session
```

### Adding an MCP Server

```bash
curl -X POST http://localhost:16006/hennos/conversation/my-session/tools \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-mcp-server",
    "url": "https://api.example.com/mcp",
    "transport": "http",
    "headers": [
      {
        "key": "Authorization",
        "value": "Bearer token123"
      }
    ]
  }'
```

## Validation Errors

When a request fails validation, you'll receive a detailed error response:

```json
{
  "status": "error",
  "message": "Validation failed",
  "details": "message: String must contain at least 1 character(s)"
}
```

## Testing

The OpenAPI implementation includes comprehensive tests:

- `tests/client/api-schemas.test.ts` - 33 tests for Zod schema validation
- `tests/client/openapi.test.ts` - 8 tests for OpenAPI document generation

Run tests with:

```bash
npm test
```

## Development

To modify the API schemas:

1. Edit schemas in `src/client/api-schemas.ts`
2. Update OpenAPI definitions in `src/client/openapi.ts`
3. Add/update validation middleware in endpoints in `src/client/api.ts`
4. Add tests for new schemas in `tests/client/api-schemas.test.ts`

The OpenAPI spec will automatically reflect your changes on the next server restart.
