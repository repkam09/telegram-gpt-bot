import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import axios from "axios";
import { Config } from "../singletons/config";
import { TelegramBotInstance } from "../services/telegram/telegram";
import { HennosConsumer, HennosGroup } from "../singletons/consumer";
import { ValidLLMProvider } from "../types";

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


export class MetaFeatureRequest extends BaseTool {
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

export class MetaFeedbackTool extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "hennos_feedback",
                description: [
                    "Use this tool to send feedback, suggestions, or questions directly to the administrator of Hennos.",
                    "This is great for general comments, compliments, usage questions, or improvement ideas.",
                    "The message will be delivered directly to the Hennos admin with information about who sent it.",
                    "Make sure to get confirmation from the user before sending their feedback.",
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        message: {
                            type: "string",
                            description: "The feedback message that will be sent to the administrator."
                        }
                    },
                    required: ["message"]
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "MetaFeedbackTool callback", { message: args.message });

        if (!args.message) {
            return ["hennos_feedback: message not provided", metadata];
        }

        try {
            // Format the feedback message with user information
            const formattedMessage = `📬 Feedback from ${req.displayName} (ID: ${req.chatId}):\n\n${args.message}`;
            await TelegramBotInstance.sendAdminMessage(formattedMessage);

            return ["Your feedback has been sent to the creator. Thank you for your input!", metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(req, "MetaFeedbackTool unable to send feedback", { message: args.message, error: error.message });
            return ["Unable to send your feedback. Please try again later.", metadata];
        }
    }
}

export class MetaSetUserPreferredName extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "set_user_preferred_name",
                description: [
                    "Use this tool to set a preferred name for the user.",
                    "If a user asks to be called something else, you can use this tool to update their preferred name within the system.",
                    "This tool provides the same functionality that exists in the user '/settings' menu for setting a preferred name."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        preferredName: {
                            type: "string",
                            description: "The preferred name to be set for the user."
                        },
                    },
                    required: ["preferredName"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "SetUserPreferredName callback", { preferredName: args.preferredName });
        if (!args.preferredName) {
            return ["set_user_preferred_name, preferredName not provided", metadata];
        }

        try {
            if (req instanceof HennosGroup) {
                return ["set_user_preferred_name, this feature is not available for groups", metadata];
            }

            await req.setPreferredName(args.preferredName);
            return ["set_user_preferred_name: success", metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(req, "SetUserPreferredName unable to set preferred name", { preferredName: args.preferredName, error: error.message });
            return ["set_user_preferred_name, unable to set preferred name", metadata];
        }
    }
}

export class MetaSetBotPreferredName extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "set_bot_preferred_name",
                description: [
                    "Use this tool to set a preferred name for yourself. By default you are 'Hennos'.",
                    "If the user wants to give you a different name, you can use this tool to update their settings within the system.",
                    "This tool provides the same functionality that exists in the user '/settings' menu for setting a preferred bot name."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        preferredName: {
                            type: "string",
                            description: "The preferred name to be set for the bot."
                        },
                    },
                    required: ["preferredName"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "SetBotPreferredName callback", { preferredName: args.preferredName });
        if (!args.preferredName) {
            return ["set_bot_preferred_name, preferredName not provided", metadata];
        }

        try {
            if (req instanceof HennosGroup) {
                return ["set_bot_preferred_name, this feature is not available for groups", metadata];
            }

            await req.setPreferredBotName(args.preferredName);
            return ["set_bot_preferred_name: success", metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(req, "SetBotPreferredName unable to set preferred name", { preferredName: args.preferredName, error: error.message });
            return ["set_bot_preferred_name, unable to set preferred name", metadata];
        }
    }
}


export class MetaSetLLMProvider extends BaseTool {
    public static isEnabled(): boolean {
        return true;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "set_llm_provider",
                description: [
                    "Use this tool to change the LLM provider that powers Hennos.",
                    "If the user asks to use a different LLM provider, you can use this tool to update their settings within the system.",
                    "This tool provides the same functionality that exists in the user '/settings' menu for setting a preferred LLM provider."
                ].join(" "),
                parameters: {
                    type: "object",
                    properties: {
                        provider: {
                            type: "string",
                            enum: [
                                "openai",
                                "anthropic",
                                "ollama",
                            ],
                            description: "The LLM provider to use for future messages."
                        },
                    },
                    required: ["provider"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(req, "MetaSetLLMProvider callback", { provider: args.provider });
        if (!args.provider) {
            return ["set_llm_provider, provider not provided", metadata];
        }

        if (!["openai", "anthropic", "ollama"].includes(args.provider)) {
            return ["set_llm_provider, invalid provider specified", metadata];
        }

        try {
            if (req instanceof HennosGroup) {
                return ["set_llm_provider, this feature is not available for groups", metadata];
            }

            await req.setPreferredProvider(args.provider as ValidLLMProvider);
            return ["set_llm_provider: success", metadata];
        } catch (err: unknown) {
            const error = err as Error;
            Logger.error(req, "MetaSetLLMProvider unable to set provider", { provider: args.provider, error: error.message });
            return ["set_llm_provider, unable to set provider", metadata];
        }
    }
}