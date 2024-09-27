import { Logger } from "../singletons/logger";
import { HennosConsumer } from "../singletons/base";
import { Tool } from "ollama";
import { BaseTool, ToolCallFunctionArgs, ToolCallMetadata } from "./BaseTool";

export class WolframAlpha extends BaseTool {
    public static isEnabled(): boolean {
        if (process.env.WOLFRAM_ALPHA_APP_ID) {
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
                    "WolframAlpha understands natural language queries about entities in chemistry, physics, geography, history, art, astronomy, and more.",
                    "WolframAlpha performs mathematical calculations, date and unit conversions, formula solving, etc.",
                    "When calling this tool, follow these guidelines:",
                    "- Convert inputs to simplified keyword queries whenever possible (e.g. convert \"how many people live in France\" to \"France population\").",
                    "- ALWAYS use this exponent notation: `6*10^14`, NEVER `6e14`.",
                    "- ALWAYS use proper Markdown formatting for all math, scientific, and chemical formulas, symbols, etc.",
                    "- Use ONLY single-letter variable names, with or without integer subscript (e.g., n, n1, n_1).",
                    "- Include a space between compound units (e.g., \"Ω m\" for \"ohm*meter\").",
                ].join("\n"),
                parameters: {
                    type: "object",
                    properties: {
                        input: {
                            type: "string",
                            description: "The natural language input question to send to the WolframAlpha API",
                        },
                    },
                    required: ["input"],
                }
            }
        };
    }

    public static async callback(req: HennosConsumer, args: ToolCallFunctionArgs, metadata: ToolCallMetadata): Promise<[string, ToolCallMetadata]> {
        Logger.info(req, "WolframAlpha callback", { input: args.input });
        if (!args.input) {
            return ["wolfram_alpha, input not provided", metadata];
        }

        try {
            const response = await BaseTool.fetchTextData(`https://www.wolframalpha.com/api/v1/llm-api?appid=${process.env.WOLFRAM_ALPHA_APP_ID}&maxchars=4096&input=${encodeURI(args.input)}`);
            Logger.debug("WolframAlpha callback", { input: args.input, response_length: response.length });
            return [`wolfram_alpha, input '${args.input}', returned the following response: ${response}`, metadata];
        } catch (err) {
            const error = err as Error;
            Logger.error(req, "WolframAlpha callback error", { input: args.input, err: error.message });
            return [`wolfram_alpha, input '${args.input}', encountered an error while fetching results`, metadata];
        }
    }
}
