import { Logger } from "../singletons/logger";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata, ToolCallResponse } from "./BaseTool";
import { Config } from "../singletons/config";

export class WolframAlpha extends BaseTool {
    public static isEnabled(): boolean {
        if (Config.WOLFRAM_ALPHA_APP_ID) {
            return true;
        }

        return false;
    }

    public static definition(): Tool {
        return {
            type: "function",
            function: {
                name: "wolfram_alpha",
                description: [
                    "WolframAlpha interprets natural language queries across diverse domains like chemistry, physics, geography, history, art, astronomy, and more.",
                    "It can execute mathematical calculations, date and unit conversions, solve formulas, and handle various scientific inquiries.",
                    "Guidelines for using this tool effectively:",
                    "- Simplify inputs to keyword-based queries when feasible (e.g., change \"how many people live in France\" to \"France population\").",
                    "- Always represent exponents using this notation: `6*10^14`, not `6e14`.",
                    "- Use proper Markdown for displaying all mathematical, scientific, and chemical formulas and symbols.",
                    "- Adopt single-letter variable naming, with optional integer subscripts (e.g., n, n1, n_1).",
                    "- Insert spaces between compound units (e.g., \"Ω m\" for \"ohm*meter\")."
                ].join("\n"),
                parameters: {
                    type: "object",
                    properties: {
                        input: {
                            type: "string",
                            description: "The natural language question or query to be sent to the WolframAlpha API."
                        },
                    },
                    required: ["input"],
                }
            }
        };
    }

    public static async callback(workflowId: string, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<ToolCallResponse> {
        Logger.info(workflowId, `WolframAlpha callback. ${JSON.stringify({ input: args.input })}`);
        if (!args.input) {
            return ["wolfram_alpha, input not provided", metadata];
        }

        try {
            const response = await BaseTool.fetchTextData(`https://www.wolframalpha.com/api/v1/llm-api?appid=${Config.WOLFRAM_ALPHA_APP_ID}&maxchars=4096&input=${encodeURI(args.input)}`);
            Logger.debug(workflowId, `WolframAlpha callback. ${JSON.stringify({ input: args.input, response_length: response.length })}`);
            return [`wolfram_alpha, input '${args.input}', returned the following response: ${response}`, metadata];
        } catch (err) {
            const error = err as Error;
            Logger.error(workflowId, `WolframAlpha callback error. ${JSON.stringify({ input: args.input, err: error.message })}`, error);
            return [`wolfram_alpha, input '${args.input}', encountered an error while fetching results`, metadata];
        }
    }
}
