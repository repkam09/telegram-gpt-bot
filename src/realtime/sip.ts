import OpenAI from "openai";
import { Config } from "../singletons/config";
import { Logger } from "../singletons/logger";
import { WebSocket } from "ws";
import { TerminateCall } from "./terminate";
import { RealtimeBraveSearch } from "./brave";
import { RealtimeWeatherLookup } from "./weather";
import { Request, Response } from "express";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export function createWorkflowId(platform: string, chatId: string): string {
    const payload = JSON.stringify({
        platform,
        chatId,
        type: "realtime",
    });
    return payload;
}

type RealtimeCallIncomingEvent = {
    "object": string,
    "id": string,
    "type": string,
    "created_at": number, // Unix timestamp
    "data": RealtimeCallIncomingEventData
}

type RealtimeCallIncomingEventData = {
    "call_id": string,
    "sip_headers": { name: string; value: string }[]
}


export class HennosRealtime {
    private static client: OpenAI = new OpenAI({
        apiKey: Config.OPENAI_API_KEY,
    });

    private static tokens: Map<
        string,
        OpenAI.Beta.Realtime.Sessions.SessionCreateResponse.ClientSecret
    > = new Map();

    private static promptRealtime(): string {
        const system: Message[] = [
            {
                role: "system",
                content:
                    "You are a conversational assistant named 'Hennos' that is helpful, creative, clever, and friendly.",
            },
            {
                role: "system",
                content:
                    "Your job is to assist users in a variety of tasks, including answering questions, providing information, and engaging in conversation.",
            },
            {
                role: "system",
                content:
                    "You were created and are maintained by the software developer Mark Repka, @repkam09 on GitHub, and are Open Source on GitHub at https://github.com/repkam09/telegram-gpt-bot",
            },
            {
                role: "system",
                content: `Your knowledge is based on the data your model was trained on, which has a cutoff date of October, 2023. The current date is ${new Date().toDateString()}.`,
            },
        ];

        return system.map((message) => message.content).join("\n\n");
    }

    public static clearExpiredTokens(): void {
        const now = Date.now() / 1000;
        const tokens = Array.from(HennosRealtime.tokens.entries());

        const expiredTokens: string[] = [];
        for (const [chatId, token] of tokens) {
            if (token.expires_at < now) {
                Logger.info(chatId,
                    `Token for chatId: ${chatId} has expired, expires_at: ${token.expires_at}, now: ${now}`
                );
                expiredTokens.push(chatId);
            } else {
                Logger.info(chatId,
                    `Token for chatId: ${chatId} is still valid, expires_at: ${token.expires_at}, now: ${now}`
                );
            }
        }

        expiredTokens.forEach((chatId) =>
            HennosRealtime.tokens.delete(chatId)
        );
    }

    public static middleware() {
        return async (req: Request, res: Response) => {
            if (!req.body) {
                Logger.error("HennosRealtime", "Missing request body");
                return res.status(400).send("Missing request body");
            }

            if (!req.body.type) {
                Logger.error("HennosRealtime", "Missing request type");
                return res.status(400).send("Missing request type");
            }

            if (req.body.type !== "realtime.call.incoming") {
                Logger.error("HennosRealtime", `Unsupported request type: ${req.body.type}`);
                return res.status(400).send(`Unsupported request type: ${req.body.type}`);
            }

            Logger.info("HennosRealtime", `Received request: ${JSON.stringify(req.body)}`);

            const callId = req.body.data?.call_id;
            if (!callId) {
                Logger.error("HennosRealtime", "Missing call_id");
                return res.status(400).send("Missing call_id");
            }

            // TODO: Some way of looking up the phone number to associate with a workflowId
            const workflowId = createWorkflowId("sip", callId);

            const body = req.body as RealtimeCallIncomingEvent;

            await HennosRealtime.createRealtimeSIPSession(workflowId, body.data);
            return res.status(200).json({ status: "ok" });
        };
    }

    public static async createRealtimeSIPSession(workflowId: string, data: RealtimeCallIncomingEventData) {
        Logger.info(workflowId, "OpenAI Realtime SIP Request Received");
        HennosRealtime.clearExpiredTokens();

        // Log the sip_headers for debugging
        if (data.sip_headers) {
            const important = [
                "From",
                "P-Asserted-Identity",
                "User-Agent",
                "X-Twilio-CallSid",
            ];
            for (const header of important) {
                const value = data.sip_headers.find((h) => h.name === header)?.value;
                if (value) {
                    Logger.info(workflowId, ` > ${header}: ${value}`);
                }
            }
        }

        if (!HennosRealtime.client || !HennosRealtime.client.realtime) {
            Logger.error(workflowId, "OpenAI Realtime client not initialized");
            return;
        }

        Logger.info(workflowId, `Accepting call_id: ${data.call_id}`);
        await HennosRealtime.client.realtime.calls.accept(data.call_id, {
            type: "realtime",
            model: "gpt-realtime-mini",
            instructions: HennosRealtime.promptRealtime(),
            tools: [TerminateCall.definition(), RealtimeBraveSearch.definition(), RealtimeWeatherLookup.definition()],
            tool_choice: "auto",
            audio: {
                output: {
                    voice: "ash",
                },
            },
        });

        setTimeout(() => {
            try {
                const socket = new WebSocket(
                    "wss://api.openai.com/v1/realtime?call_id=" + data.call_id,
                    {
                        headers: {
                            Authorization: `Bearer ${Config.OPENAI_API_KEY}`,
                        },
                    }
                );

                socket.on("open", () => {
                    Logger.info(workflowId,
                        `SIP Realtime WebSocket connected for call_id: ${data.call_id}`
                    );

                    socket.on("message", (rawPayload) => {
                        // TODO: When the user / assistant transcript is generated, signal it into the Workflow
                        //       if we have a valid workflowId to associate with.

                        try {
                            const payload = JSON.parse(rawPayload.toString());
                            const ignore = ["response.output_audio_transcript.delta"];
                            if (!ignore.includes(payload.type)) {
                                Logger.info(workflowId, `SIP ${data.call_id}: ${rawPayload}`);

                                if (payload.type === "response.done") {
                                    if (payload.response.object === "realtime.response") {
                                        const items = payload.response.output;

                                        for (const item of items) {
                                            if (
                                                item.type === "function_call" &&
                                                item.status === "completed"
                                            ) {
                                                let args: Record<string, string> = {};
                                                try {
                                                    args = JSON.parse(item.arguments);
                                                } catch (err: unknown) {
                                                    const error = err as Error;
                                                    Logger.error(workflowId,
                                                        `SIP Error parsing function call arguments for call_id ${data.call_id}: ${error.message}`
                                                    );
                                                }

                                                switch (item.name) {
                                                    case "terminate_session": {
                                                        TerminateCall.callback(
                                                            workflowId,
                                                            socket,
                                                            data.call_id,
                                                            args
                                                        ).finally(() => {
                                                            // Hang up the call immediately
                                                            this.client.realtime.calls
                                                                .hangup(data.call_id)
                                                                .then(() => {
                                                                    Logger.info(workflowId,
                                                                        `SIP Hangup call_id: ${data.call_id}`
                                                                    );
                                                                })
                                                                .catch((hangupErr: unknown) => {
                                                                    const error = hangupErr as Error;
                                                                    Logger.error(workflowId,
                                                                        `SIP Error hanging up call_id ${data.call_id}: ${error.message}`
                                                                    );
                                                                });
                                                        });
                                                        break;
                                                    }

                                                    case "brave_search": {
                                                        RealtimeBraveSearch.callback(workflowId, args).then((result) => {
                                                            this.sendToolResponse(socket, data.call_id, result);
                                                        }).catch((error) => {
                                                            Logger.error(workflowId,
                                                                `SIP Error calling BraveSearch for call_id ${data.call_id}: ${error.message}`
                                                            );
                                                            this.sendToolResponse(socket, data.call_id, error);
                                                        });
                                                        break;
                                                    }

                                                    case "open_weather_map_lookup": {
                                                        RealtimeWeatherLookup.callback(workflowId, args).then((result) => {
                                                            this.sendToolResponse(socket, data.call_id, result);
                                                        }).catch((error) => {
                                                            Logger.error(workflowId,
                                                                `SIP Error calling OpenWeatherMapLookup for call_id ${data.call_id}: ${error.message}`
                                                            );
                                                            this.sendToolResponse(socket, data.call_id, error);

                                                        });
                                                        break;
                                                    }

                                                    default: {
                                                        Logger.error(workflowId,
                                                            `SIP Unknown function call '${item.name}' for call_id: ${data.call_id}`
                                                        );

                                                        socket.send(
                                                            JSON.stringify({
                                                                type: "conversation.item.create",
                                                                item: {
                                                                    type: "function_call_output",
                                                                    call_id: item.call_id,
                                                                    output: "Error: Unknown function call",
                                                                },
                                                            })
                                                        );

                                                        socket.send(
                                                            JSON.stringify({
                                                                type: "response.create",
                                                            })
                                                        );
                                                        break;
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        } catch (err) {
                            Logger.error(workflowId, `SIP Error call_id ${data.call_id}: ${err} - payload: ${rawPayload}`);
                        }
                    });

                    socket.send(
                        JSON.stringify({
                            type: "response.create",
                            response: {
                                instructions:
                                    "Introduce yourself to the caller as 'Hennos' and ask how you can assist them today.",
                            },
                        })
                    );
                });
            } catch (err) {
                Logger.error(workflowId, `SIP Error call_id ${data.call_id}: ${err}`);

                this.client.realtime.calls
                    .hangup(data.call_id)
                    .then(() => {
                        Logger.info(workflowId, `SIP Hangup call_id: ${data.call_id}`);
                    })
                    .catch((hangupErr) => {
                        Logger.error(workflowId, `SIP Error hanging up call_id ${data.call_id}: ${hangupErr}`);
                    });
            }
        }, 1700);
    }

    private static sendToolResponse(socket: WebSocket, callId: string, result: object | Error): void {
        socket.send(
            JSON.stringify({
                type: "conversation.item.create",
                item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: JSON.stringify(result),
                },
            })
        );
        socket.send(
            JSON.stringify({
                type: "response.create",
            })
        );
    }
}
