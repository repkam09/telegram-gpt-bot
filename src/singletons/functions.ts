import { ChatCompletionFunctions } from "openai";
import { Logger } from "./logger";

type HennosChatCompletionFunctionCall = (chatId: number, args: unknown) => Promise<string>
type HennosChatCompletionFunctionConfig = ChatCompletionFunctions & { calls:  HennosChatCompletionFunctionCall};

export class Functions { 
    static _functions: Map<string, HennosChatCompletionFunctionConfig> = new Map();
    static _function_names: string[] = [];

    static instance(): void {
        // Do nothing for now!
    }

    static registered(): ChatCompletionFunctions[] {
        const entries: ChatCompletionFunctions[] = Functions._function_names.map((fn) => {
            const {name, description, parameters} = Functions._functions.get(fn) as HennosChatCompletionFunctionConfig;
            return {
                name,
                description,
                parameters
            };
        });

        return entries;
    }

    static register(rules: ChatCompletionFunctions, func: HennosChatCompletionFunctionCall): void {
        if (Functions._function_names.includes(rules.name)) {
            throw new Error(`Function name ${rules.name} is already registered`);
        }

        Functions._function_names.push(rules.name);
        Functions._functions.set(rules.name, {...rules, calls: func});
        Logger.info(`ChatCompletionFunction registered ${rules.name} with description ${rules.description}`);
    }

    // This function provides a dumb way to keep stuff in the code but not have it active
    static skip_register(rules: ChatCompletionFunctions, func: HennosChatCompletionFunctionCall): void {
        Logger.info(`ChatCompletionFunction skipped ${rules.name} with description ${rules.description}`);
    }

    static call(chatId: number, name: string, args: string): Promise<string> {
        const current = Functions._functions.get(name);
        if (!current) {
            throw new Error(`Function name ${name} is not registered`);
        }

        const obj = JSON.parse(args);
        Logger.info("ChatId", chatId, "function_call ", name);
        return current.calls(chatId, obj);
    }
}
