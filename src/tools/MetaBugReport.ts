import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import axios from "axios";
import { Config } from "../singletons/config";

export class MetaBugReport extends BaseTool {
    public static isEnabled(): boolean {
        if (Config.GITHUB_API_KEY) {
            return true;
        }

        return false;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "bug_report",
                description: [
                    "Use this tool to report a bug or report an issue to the developers. This will create an issue on GitHub for the developers to review.",
                    "The bug report should include a title and a detailed description of the bug or issue.",
                    "Make sure to get confirmation from the user before sending the bug report.",
                    "Keep in mind that this will create a public issue on GitHub, so do not include any sensitive information.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        title: {
                            type: "string",
                            description: "The title of the bug or issue."
                        },
                        report: {
                            type: "string",
                            description: "A detailed description of the bug or issue.."
                        },
                    },
                    required: ["report", "title"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "MetaBugReport callback", { title: args.title, report: args.report });
        if (!args.title) {
            return ["bug_report, title not provided", metadata];
        }

        if (!args.report) {
            return ["bug_report, report not provided", metadata];
        }

        try {
            const url = await createGitHubIssue(req, args.title, args.report);
            return [`bug_report: ${url}`, metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(req, "MetaBugReport unable to create bug report", { title: args.title, report: args.report, error: error.message });
            return ["bug_report, unable to create but report", metadata];
        }
    }
}

async function createGitHubIssue(req: HennosConsumer, title: string, report: string): Promise<string> {
    Logger.debug(req, "createGitHubIssue", { title, report });

    const response = await axios.post("https://api.github.com/repos/repkam09/telegram-gpt-bot/issues", {
        title: title,
        body: report,
        labels: ["bug_report_tool"]
    }, {
        headers: {
            "Authorization": `Bearer ${Config.GITHUB_API_KEY}`,
            "Accept": "application/vnd.github+json"
        }
    });

    return response.data.html_url;
}  