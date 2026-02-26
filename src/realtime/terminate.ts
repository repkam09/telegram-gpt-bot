import { RealtimeFunctionTool } from "openai/resources/realtime/realtime";
import { WebSocket } from "ws";
import { Logger } from "../singletons/logger";

export class TerminateCall {
    public static definition(): RealtimeFunctionTool {
        return {
            type: "function",
            name: "terminate_session",
            description:
                "Use this tool to end the call with the user. This tool should be used when the user indicates that their questions are answered, the conversation reaches a natural conclusion, or if the user says goodbye.",
            parameters: {
                type: "object",
                properties: {
                    reason: {
                        type: "string",
                        description: "The reason for ending the call.",
                    },
                },
                required: ["reason"],
            },
        };
    }

    public static async callback(
        socket: WebSocket,
        callId: string,
        args: Record<string, string>
    ): Promise<void> {
        // Log the reason for ending the call
        if (args.reason) {
            Logger.info(callId, `SIP Ending call_id ${callId}: ${args.reason}`);
        } else {
            Logger.info(callId, `SIP Ending call_id ${callId} with no reason provided`);
        }
        // Acknowledge the function call
        socket.send(
            JSON.stringify({
                type: "conversation.item.create",
                item: {
                    type: "function_call_output",
                    call_id: callId,
                    output: "terminate_session",
                },
            })
        );
    }
}
