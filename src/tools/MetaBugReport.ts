import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata } from "./BaseTool";
import { TelegramBotInstance } from "../services/telegram/telegram";

export class MetaBugReport extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "bug_report",
                description: [
                    "This tool is used to report a bug in the Hennos system itself. If a user mentions an issue with Hennos, this tool can be used to log the issue for later review by the developer.",
                    "You should ask the user for confirmation before logging the bug report."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        report: {
                            type: "string",
                            description: "The bug report to log.",
                        },
                    },
                    required: ["report"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<[string, ToolCallMetadata]> {
        Logger.info(req, "MetaBugReport callback", { report: args.report });
        if (!args.report) {
            return ["bug_report, report not provided", metadata];
        }

        try {
            await TelegramBotInstance.sendAdminMessage(`Bug Report Tool (${req.displayName}):\n\n${args.report}`);
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(req, "MetaBugReport unable to send admin message", { report: args.report, err: error.message });
        }

        return ["bug_report created", metadata];
    }
}