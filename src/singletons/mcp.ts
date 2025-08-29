import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { Config } from "./config";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport";
import { Tool as MCPTool } from "@modelcontextprotocol/sdk/types";
import { ToolCallMetadata, ToolCallResponse } from "../tools/BaseTool";
import { HennosConsumer } from "./consumer";
import { Logger } from "./logger";

type ClientInstance = {
    client: Client
    name: string
}

export class HennosMCPClient {
    public static servers: ClientInstance[] = [];

    public static async init() {
        const servers = Config.MCP_SERVERS;

        const promises = servers.map(async (server) => {
            let transport: Transport;
            if (server.type === "http") {
                transport = new StreamableHTTPClientTransport(new URL(server.url), {
                    requestInit: {
                        headers: server.headers
                    }
                });
            } else if (server.type === "sse") {
                transport = new SSEClientTransport(new URL(server.url), {
                    requestInit: {
                        headers: server.headers
                    }
                });
            } else {
                console.warn(`Unknown MCP server type: ${server.type}`);
                return Promise.reject();
            }

            const client = new Client(
                {
                    name: `hennos-${server.name}`,
                    version: "1.0.0"
                }
            );

            Logger.info(`Connecting to MCP server: ${server.name}`);
            await client.connect(transport);
            Logger.info(`Connected to MCP server: ${server.name}`);
            return {
                client,
                name: server.name
            };
        });

        const results = await Promise.allSettled(promises);
        results.forEach((server) => {
            if (server.status === "fulfilled") {
                HennosMCPClient.servers.push(server.value);
            } else {
                console.error(`Failed to connect to MCP server: ${server.reason}`);
            }
        });
    }

    public static async availableTools(): Promise<MCPTool[]> {
        const promises = HennosMCPClient.servers.map(async (client) => {
            const results = await client.client.listTools();
            Logger.debug(`MCP Server ${client.name} has ${results.tools.length} tools available`);
            return {
                tools: results,
                name: client.name
            };
        });
        const results = await Promise.allSettled(promises);

        const tools: MCPTool[] = [];
        results.forEach((result) => {
            if (result.status === "fulfilled") {
                result.value.tools.tools.forEach((tool) => {
                    tools.push({
                        ...tool,
                        name: `MCP--${result.value.name}--${tool.name}`
                    });
                });
            }
        });

        return tools;
    }

    public static splitToolName(mcpToolName: string): { serverName: string; toolName: string } | null {
        // format: 'MCP--serverName--toolname'
        const match = mcpToolName.match(/^MCP--(.+?)--(.+)$/);
        if (!match || match.length !== 3) {
            return null;
        }

        return {
            serverName: match[1],
            toolName: match[2]
        };
    }

    public static async executeTool(req: HennosConsumer, serverName: string, toolName: string, args: Record<string, unknown>, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        const server = HennosMCPClient.servers.find((s) => s.name === serverName);
        if (!server) {
            throw new Error(`MCP server not found: ${serverName}`);
        }

        Logger.info(req, "MCP callback", { server: serverName, tool: toolName, args });
        try {
            const result = await server.client.callTool({ name: toolName, arguments: args });
            if (result.content) {
                // content should be an array of text responses for most servers.
                if (Array.isArray(result.content)) {
                    const content = result.content.map((item: { type?: string; text?: string }) => {
                        if (item.type && item.type === "text" && item.text) {
                            return item.text;
                        }
                        return undefined;
                    }).filter((text): text is string => text !== undefined);
                    Logger.info(req, "MCP callback result", { server: serverName, tool: toolName, content });

                    const response = content.join("\n");
                    return [response, metadata];
                } else {
                    Logger.warn(req, "MCP callback result is not an array", { server: serverName, tool: toolName, result: JSON.stringify(result) });
                }
            }
            Logger.debug(req, "MCP callback result", { server: serverName, tool: toolName, result: JSON.stringify(result) });
            return [JSON.stringify(result), metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(req, `Error calling MCP tool: ${error.message}`);
            return [`Error while calling MCP tool ${toolName} on server ${serverName}: ${error.message}`, metadata];
        }
    }
}