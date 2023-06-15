import { ChatCompletionFunctions } from "openai";
import { Logger } from "./logger";
import { updateChatContextWithName } from "../handlers/text/common";

export type HennosChatCompletionFunctionCall = (chatId: number, args: FuncParams) => Promise<string>
export type HennosChatCompletionFunctionConfig = ChatCompletionFunctions & { calls:  HennosChatCompletionFunctionCall, whitelist: number[]};
export type FuncParams = {[x: string]: unknown}

export class Functions { 
    private static _functions: Map<string, HennosChatCompletionFunctionConfig> = new Map();
    private  static _function_names: string[] = [];

    public static instance(): void {
        // Do nothing for now!
    }

    public static registered(chatId: number): ChatCompletionFunctions[] {
        const entries: (ChatCompletionFunctions | undefined)[] = Functions._function_names.map((fn) => {
            const {name, description, parameters, whitelist} = Functions._functions.get(fn) as HennosChatCompletionFunctionConfig;

            if (whitelist.length > 0 && !whitelist.includes(chatId)) {
                Logger.debug(`ChatId  ${chatId} Exclude Function ${name}`);
                return undefined;
            }

            Logger.debug(`ChatId  ${chatId} Include Function ${name}`);
            return {
                name,
                description,
                parameters
            };
        });

        const available = entries.filter((entry) => entry !== undefined) as ChatCompletionFunctions[];
        return available;
    }

    public static register(rules: ChatCompletionFunctions, func: HennosChatCompletionFunctionCall, whitelist: number[] = []): void {
        if (Functions._function_names.includes(rules.name)) {
            throw new Error(`Function name ${rules.name} is already registered`);
        }

        Functions._function_names.push(rules.name);
        Functions._functions.set(rules.name, {...rules, calls: func, whitelist});
        Logger.info(`ChatCompletionFunction registered ${rules.name} with description ${rules.description}`);
    }

    // This function provides a dumb way to keep stuff in the code but not have it active
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public static skip_register(rules: ChatCompletionFunctions, _func: HennosChatCompletionFunctionCall): void {
        Logger.info(`ChatCompletionFunction skipped ${rules.name} with description ${rules.description}`);
    }

    public static async call(chatId: number, fnName: string, args: string): Promise<void> {
        const current = Functions._functions.get(fnName);
        if (!current) {
            throw new Error(`Function name ${fnName} is not registered`);
        }

        Logger.info("ChatId", chatId, "function_call ", fnName);
        const result = await current.calls(chatId, JSON.parse(args) as FuncParams);
        await updateChatContextWithName(chatId, fnName, "function", result);
        return;
    }
}
