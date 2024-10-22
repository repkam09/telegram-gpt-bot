import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { TelegramBotInstance } from "../services/telegram/telegram";

export class MetaBugReport extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "bug_report",
                description: [
                    "Use this tool to report a bug or issue encountered within the Hennos system.",
                    "If a user identifies a problem or anomaly, this tool logs the issue for the development team's review and resolution.",
                    "Ensure to confirm with the user before proceeding to log the bug report."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        report: {
                            type: "string",
                            description: "A detailed description of the bug or issue to be logged."
                        },
                    },
                    required: ["report"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "MetaBugReport callback", { report: args.report });
        if (!args.report) {
            return ["bug_report, report not provided", metadata];
        }

        try {
            await TelegramBotInstance.sendAdminMessage(`Bug Report Tool (${req.displayName}):\n\n${args.report}`);
        } catch (err) {
            Logger.error(req, "MetaBugReport unable to send admin message", { report: args.report });
        }

        return ["bug_report created", metadata];
    }
}