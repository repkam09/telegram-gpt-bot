import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import axios from "axios";
import { Config } from "../singletons/config";

export class MetaFeatureRequest extends BaseTool {
    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "feature_request",
                description: [
                    "Use this tool to request a new feature or enhancement for Hennos. This will create an issue on GitHub for the developers to review.",
                    "The feature request should include a title and a detailed description of the feature request.",
                    "Make sure to get confirmation from the user before sending the feature request.",
                    "Keep in mind that this will create a public issue on GitHub, so do not include any sensitive information.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        title: {
                            type: "string",
                            description: "The title of the feature request."
                        },
                        request: {
                            type: "string",
                            description: "A detailed description of the feature request."
                        },
                    },
                    required: ["request", "title"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "MetaFeatureRequest callback", { title: args.title, request: args.request });
        if (!args.title) {
            return ["feature_request, title not provided", metadata];
        }

        if (!args.request) {
            return ["feature_request, request not provided", metadata];
        }

        try {
            const url = await createGitHubFeatureRequest(req, args.title, args.request);
            return [`feature_request: ${url}`, metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(req, "MetaFeatureRequest unable to create feature request", { title: args.title, request: args.request, error: error.message });
            return ["feature_request, unable to create feature request", metadata];
        }
    }
}

async function createGitHubFeatureRequest(req: HennosConsumer, title: string, request: string): Promise<string> {
    Logger.debug(req, "createGitHubIssue", { title, request });

    const response = await axios.post("https://api.github.com/repos/repkam09/telegram-gpt-bot/issues", {
        title,
        body: request,
        labels: ["feature_request_tool"]
    }, {
        headers: {
            "Authorization": `Bearer ${Config.GITHUB_API_KEY}`,
            "Accept": "application/vnd.github+json"
        }
    });

    return response.data.html_url;
}  