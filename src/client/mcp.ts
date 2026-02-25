import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { Request, Response } from "express";
import z from "zod";
import { Config } from "../singletons/config";
import { createTemporalClient } from "../singletons/temporal";
import { agentWorkflow, agentWorkflowMessageSignal } from "../temporal/workflows";
import { createWorkflowId } from "../temporal/agent/interface";
import { Database } from "../database";
import { AgentResponseHandler } from "../response";
import { Logger } from "../singletons/logger";

export class ModelContextProtocolServer {
    private static instance: McpServer;
    private static sessions: Record<string, { server: McpServer, transport: StreamableHTTPServerTransport }> = {};

    static server(): McpServer {
        return ModelContextProtocolServer.instance;
    }

    static async run(): Promise<void> {
        Logger.info(undefined, "Starting Hennos MCP Server...");
        const server = new McpServer({
            name: "Hennos Agent MCP Server",
            version: "1.0.0",
        });

        server.registerTool("hennos_create_session", {
            description: "Creates a new chat session, returning the sessionId. Use the same sessionId for all subsequent Hennos calls.",
            inputSchema: {}
        }, async () => {
            const db = Database.instance();
            const sessionId = `mcp_${randomUUID()}`;

            Logger.info(sessionId, `Creating new Hennos session with Id: ${sessionId}`);

            try {
                await db.workflowSession.create({
                    data: {
                        id: sessionId,
                        activePlatform: sessionId,
                    }
                });
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ sessionId })
                    }],
                    isError: false,
                };
            } catch (err: unknown) {
                const error = err instanceof Error ? err : new Error(String(err));
                Logger.error(sessionId, "Error creating session:", error);
                return {
                    content: [{
                        type: "text",
                        text: JSON.stringify({ error: "Failed to create Hennos session" })
                    }],
                    isError: true,
                };
            }
        });

        server.registerTool("hennos_send_message", {
            description: "Sends a message to the Hennos agent. The sessionId of the session to send the message to must be included in the input.",
            inputSchema: z.object({
                sessionId: z.string(),
                message: z.string(),
            })
        }, async ({ message, sessionId }) => {
            Logger.info(sessionId, `Received message for MCP session. sessionId=${sessionId}, message=${message}`);
            await signalWithStartAgentWorkflow(sessionId, sessionId, message);
            try {
                const response = await registerForAgentCallback(sessionId, sessionId);
                AgentResponseHandler.unregisterListener(sessionId);
                return {
                    content: [{
                        type: "text",
                        text: response
                    }],
                    isError: false,
                };
            } catch (err: unknown) {
                const error = err instanceof Error ? err : new Error(String(err));
                Logger.error(sessionId, "Error waiting for agent response:", error);
                return {
                    content: [{
                        type: "text",
                        text: "Failed to get response from Hennos agent"
                    }],
                    isError: true,
                };
            }
        });

        ModelContextProtocolServer.instance = server;
    }

    public static middleware() {
        return async (req: Request, res: Response) => {
            const sessionIdHeader = req.headers["mcp-session-id"];
            if (Array.isArray(sessionIdHeader)) {
                return res.status(400).json({
                    jsonrpc: "2.0",
                    error: { code: -32000, message: "Bad Request: Multiple session ID headers provided" },
                    id: null
                });
            }

            let sessionEntry = null;

            if (sessionIdHeader && ModelContextProtocolServer.sessions[sessionIdHeader]) {
                sessionEntry = ModelContextProtocolServer.sessions[sessionIdHeader];

            } else if (!sessionIdHeader && isInitializeRequest(req.body)) {
                const newSessionId = randomUUID();

                // Create a new transport for this session
                const transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => newSessionId,
                    onsessioninitialized: (sid) => {
                        // Store the Transport and Server instance once session is initialized
                        ModelContextProtocolServer.sessions[sid] = { server, transport };
                    }
                });

                transport.onclose = () => {
                    if (transport.sessionId && ModelContextProtocolServer.sessions[transport.sessionId]) {
                        delete ModelContextProtocolServer.sessions[transport.sessionId];
                    }
                };

                const server = ModelContextProtocolServer.server();
                await server.connect(transport);

                ModelContextProtocolServer.sessions[newSessionId] = { server, transport };
                sessionEntry = ModelContextProtocolServer.sessions[newSessionId];

            } else {
                res.status(400).json({
                    jsonrpc: "2.0",
                    error: { code: -32000, message: "Bad Request: No valid session ID provided" },
                    id: null
                });
                return;
            }

            await sessionEntry.transport.handleRequest(req, res, req.body);
        };
    }

    public static handleSessionRequest() {
        return async (req: Request, res: Response) => {
            const sessionIdHeader = req.headers["mcp-session-id"];

            if (Array.isArray(sessionIdHeader)) {
                res.status(400).send("Multiple session ID headers provided");
                return;
            }

            if (!sessionIdHeader || !ModelContextProtocolServer.sessions[sessionIdHeader]) {
                res.status(400).send("Invalid or missing session ID");
                return;
            }

            const { transport } = ModelContextProtocolServer.sessions[sessionIdHeader];
            return transport.handleRequest(req, res);
        };
    }
}

async function signalWithStartAgentWorkflow(sessionId: string, chatId: string, input: string): Promise<void> {
    const client = await createTemporalClient();
    await client.workflow.signalWithStart(agentWorkflow, {
        taskQueue: Config.TEMPORAL_TASK_QUEUE,
        workflowId: await createWorkflowId(sessionId, chatId),
        args: [{}],
        signal: agentWorkflowMessageSignal,
        signalArgs: [input, "User", new Date().toISOString()],
    });
}

async function registerForAgentCallback(sessionId: string, chatId: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
            return reject(new Error("Timed out waiting for agent response"));
        }, 5 * 60 * 1000); // 5 minutes

        AgentResponseHandler.registerListener(sessionId, async (message: string, callbackChatId: string) => {
            if (chatId === callbackChatId) {
                clearTimeout(timer);
                return resolve(message);
            }
        });
    });
}
