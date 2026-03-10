import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Logger } from "./logger";
import { HennosBaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "../tools/BaseTool";
import { Tool as McpToolDef } from "@modelcontextprotocol/sdk/types.js";
import { Tool } from "ollama";
import { Database } from "../database";

export async function workflowSessionMcpClient(workflowSessionId: string): Promise<HennosMcpClient> {
    const client = new HennosMcpClient(workflowSessionId);
    await client.enumerate();
    return client;
}

class HennosMcpClient {
    private workflowSessionId: string;
    private tools: HennosBaseTool[] = [];

    constructor(workflowSessionId: string) {
        this.workflowSessionId = workflowSessionId;
    }

    public async enumerate(): Promise<void> {
        // read the mcp config from the database
        const db = Database.instance();
        const mcp = await db.modelContextProtocolServer.findMany({
            where: { workflowSessionId: this.workflowSessionId },
            select: {
                name: true,
                url: true,
                transport: true,
                mcpserverHeaders: {
                    select: {
                        key: true,
                        value: true
                    }
                }
            }
        });

        if (mcp.length === 0) {
            Logger.info(this.workflowSessionId, "No MCP server configured for this workflow session");
            return;
        }

        for (const serverConfig of mcp) {
            const headers = serverConfig.mcpserverHeaders.reduce((acc, header) => {
                acc[header.key] = header.value;
                return acc;
            }, {} as Record<string, string>);

            const client = new Client({ name: "hennos", version: "1.0.0" });

            let clientTransport: SSEClientTransport | StreamableHTTPClientTransport | null = null;
            if (serverConfig.transport === "http") {
                clientTransport = new StreamableHTTPClientTransport(
                    new URL(serverConfig.url),
                    { requestInit: { headers } }
                );
            }

            if (serverConfig.transport === "sse") {
                // SSE transport: inject headers into both the SSE GET stream and POST messages
                const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
                    return fetch(input, {
                        ...init,
                        headers: {
                            ...Object.fromEntries(new Headers(init?.headers).entries()),
                            ...headers,
                        },
                    });
                };

                clientTransport = new SSEClientTransport(
                    new URL(serverConfig.url),
                    {
                        eventSourceInit: { fetch: customFetch },
                        requestInit: { headers },
                    }
                );
            }

            if (!clientTransport) {
                Logger.error(this.workflowSessionId, `Unsupported transport "${serverConfig.transport}" for MCP server "${serverConfig.name}"`);
                continue;
            }

            try {
                await client.connect(clientTransport);
                const { tools } = await client.listTools();
                const hennosTools = buildMcpHennosTools(serverConfig.name, client, tools);
                this.tools.push(...hennosTools);

                Logger.info(this.workflowSessionId, `MCP server "${serverConfig.name}" connected: ${tools.length} tools loaded (${tools.map(t => t.name).join(", ")})`);
            } catch (err) {
                Logger.error(this.workflowSessionId, `Failed to connect to MCP server "${serverConfig.name}" at ${serverConfig.url}: ${(err as Error).message}`);
            }
        }
    }

    public async validate(body: { name: string; url: string; transport: string; headers: { key: string; value: string }[] }): Promise<void> {
        // Validate that the MCP Server is valid and responding before saving to the database
        if (!body || !body.name || !body.url || !body.transport || !body.headers) {
            Logger.error(undefined, "Invalid request body");
            throw new Error("Invalid request body");
        }

        // Transport should be 'http' or 'sse'
        if (!["http", "sse"].includes(body.transport)) {
            Logger.error(undefined, "Invalid transport type");
            throw new Error("Invalid transport type");
        }

        // Headers should be an array of { key: string, value: string }
        if (!Array.isArray(body.headers) || !body.headers.every((h: { key: string; value: string }) => h.key && h.value)) {
            Logger.error(undefined, "Invalid headers format");
            throw new Error("Invalid headers format");
        }

        const headers = body.headers.reduce((acc: Record<string, string>, header: { key: string; value: string }) => {
            acc[header.key] = header.value;
            return acc;
        }, {} as Record<string, string>);

        const client = new Client({ name: "hennos", version: "1.0.0" });

        let clientTransport: SSEClientTransport | StreamableHTTPClientTransport | null = null;
        if (body.transport === "http") {
            clientTransport = new StreamableHTTPClientTransport(
                new URL(body.url),
                { requestInit: { headers } }
            );
        }

        if (body.transport === "sse") {
            // SSE transport: inject headers into both the SSE GET stream and POST messages
            const customFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
                return fetch(input, {
                    ...init,
                    headers: {
                        ...Object.fromEntries(new Headers(init?.headers).entries()),
                        ...headers,
                    },
                });
            };

            clientTransport = new SSEClientTransport(
                new URL(body.url),
                {
                    eventSourceInit: { fetch: customFetch },
                    requestInit: { headers },
                }
            );
        }

        if (!clientTransport) {
            Logger.error(this.workflowSessionId, `Unsupported transport "${body.transport}" for MCP server "${body.name}"`);
            throw new Error(`Unsupported transport "${body.transport}"`);
        }

        await client.connect(clientTransport);
        await client.listTools();
    }

    public getHennosTools(): HennosBaseTool[] {
        return this.tools;
    }
}

export function buildMcpHennosTools(serverName: string, client: Client, mcpTools: McpToolDef[]): HennosBaseTool[] {
    return mcpTools.map((mcpTool) => {
        const prefixedName = `${serverName}__${mcpTool.name}`;

        const ollamaTool: Tool = {
            type: "function",
            function: {
                name: prefixedName,
                description: mcpTool.description || `Tool ${mcpTool.name} from MCP server ${serverName}`,
                parameters: mcpTool.inputSchema as Record<string, unknown>,
            }
        };

        return {
            isEnabled: () => true,
            definition: () => ollamaTool,
            callback: async (workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> => {
                try {
                    Logger.info(workflowId, `Calling MCP tool ${prefixedName} on server ${serverName}`);
                    const result = await client.callTool({
                        name: mcpTool.name,
                        arguments: args,
                    });

                    if (typeof result.content === "string") {
                        Logger.debug(workflowId, `Received string response from MCP tool ${prefixedName}: ${result.content}`);
                        return [result.content, metadata];
                    }

                    Logger.debug(workflowId, `Received ${typeof result.content} response from MCP tool ${prefixedName}.`);
                    return [JSON.stringify(result.content), metadata];
                } catch (err) {
                    const error = err as Error;
                    Logger.error(workflowId, `MCP tool call failed for ${prefixedName}: ${error.message}`);
                    return [`Error calling MCP tool ${prefixedName}: ${error.message}`, metadata];
                }
            }
        };
    });
}
