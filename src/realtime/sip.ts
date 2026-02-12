import OpenAI from "openai";
import { Config } from "../singletons/config";
import { Logger } from "../singletons/logger";
import { WebSocket } from "ws";
import { TerminateCall } from "./terminate";
import { BraveSearch } from "../tools/BraveSearch";

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export class HennosRealtime {
    private static client: OpenAI;
    private static tokens: Map<
        string,
        OpenAI.Beta.Realtime.Sessions.SessionCreateResponse.ClientSecret
    > = new Map();

    constructor() {
        if (!HennosRealtime.client) {
            HennosRealtime.client = new OpenAI({
                apiKey: Config.OPENAI_API_KEY,
            });
        }
    }

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

    public static async createRealtimeSIPSession(workflowId: string | undefined, data: {
        call_id: string;
        sip_headers: { name: string; value: string }[];
    }) {
        Logger.info(data.call_id, `OpenAI Realtime SIP Request (${data.call_id})`);
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
                    Logger.info(data.call_id, ` > ${header}: ${value}`);
                }
            }
        }

        await HennosRealtime.client.realtime.calls.accept(data.call_id, {
            type: "realtime",
            model: "gpt-realtime-mini",
            instructions: HennosRealtime.promptRealtime(),
            tools: [],
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
                    Logger.info(data.call_id,
                        `SIP Realtime WebSocket connected for call_id: ${data.call_id}`
                    );

                    socket.on("message", (rawPayload) => {
                        // TODO: When the user / assistant transcript is generated, signal it into the Workflow
                        //       if we have a valid workflowId to associate with.

                        try {
                            const payload = JSON.parse(rawPayload.toString());
                            const ignore = ["response.output_audio_transcript.delta"];
                            if (!ignore.includes(payload.type)) {
                                Logger.info(data.call_id, `SIP ${data.call_id}: ${rawPayload}`);

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
                                                    Logger.error(data.call_id,
                                                        `SIP Error parsing function call arguments for call_id ${data.call_id}: ${error.message}`
                                                    );
                                                }

                                                switch (item.name) {
                                                    case "terminate_session": {
                                                        TerminateCall.callback(
                                                            socket,
                                                            data.call_id,
                                                            args
                                                        ).finally(() => {
                                                            // Hang up the call immediately
                                                            this.client.realtime.calls
                                                                .hangup(data.call_id)
                                                                .then(() => {
                                                                    Logger.info(data.call_id,
                                                                        `SIP Hangup call_id: ${data.call_id}`
                                                                    );
                                                                })
                                                                .catch((hangupErr: unknown) => {
                                                                    const error = hangupErr as Error;
                                                                    Logger.error(data.call_id,
                                                                        `SIP Error hanging up call_id ${data.call_id}: ${error.message}`
                                                                    );
                                                                });
                                                        });
                                                        break;
                                                    }

                                                    case "brave_search": {
                                                        BraveSearch.callback(data.call_id, args, null).then(([result]) => {
                                                            socket.send(
                                                                JSON.stringify({
                                                                    type: "conversation.item.create",
                                                                    item: {
                                                                        type: "function_call_output",
                                                                        call_id: data.call_id,
                                                                        output: result,
                                                                    },
                                                                })
                                                            );
                                                            socket.send(
                                                                JSON.stringify({
                                                                    type: "response.create",
                                                                })
                                                            );
                                                        }).catch((error) => {
                                                            Logger.error(data.call_id,
                                                                `SIP Error calling BraveSearch for call_id ${data.call_id}: ${error.message}`
                                                            );
                                                            socket.send(
                                                                JSON.stringify({
                                                                    type: "conversation.item.create",
                                                                    item: {
                                                                        type: "function_call_output",
                                                                        call_id: data.call_id,
                                                                        output: `Error: ${error.message}`,
                                                                    },
                                                                })
                                                            );
                                                            socket.send(
                                                                JSON.stringify({
                                                                    type: "response.create",
                                                                })
                                                            );

                                                        });
                                                        break;
                                                    }

                                                    default: {
                                                        Logger.error(data.call_id,
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
                            Logger.error(data.call_id, `SIP Error call_id ${data.call_id}: ${err} - payload: ${rawPayload}`);
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
                Logger.error(data.call_id, `SIP Error call_id ${data.call_id}: ${err}`);

                this.client.realtime.calls
                    .hangup(data.call_id)
                    .then(() => {
                        Logger.info(data.call_id, `SIP Hangup call_id: ${data.call_id}`);
                    })
                    .catch((hangupErr) => {
                        Logger.error(data.call_id, `SIP Error hanging up call_id ${data.call_id}: ${hangupErr}`);
                    });
            }
        }, 1700);
    }
}
