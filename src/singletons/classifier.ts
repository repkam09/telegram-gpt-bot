/* eslint-disable @typescript-eslint/no-unused-vars */
import path from "node:path";
import { BayesClassifier } from "natural";
import { Config } from "./config";
import { Logger } from "./logger";
import { HennosOpenAISingleton } from "./openai";
import { HennosConsumer } from "./base";
import { HennosUser } from "./user";


export type MessageClassifications = "simple" | "complex";

export class MessageClassifier {
    private static _bayes: BayesClassifier;

    public static async init(): Promise<void> {
        if (Config.CLASSIFIER_ENABLED === "openai") {
            Logger.debug(undefined, "Initializing OpenAI classifier");
        }

        if (Config.CLASSIFIER_ENABLED === false) {
            Logger.debug(undefined, "Classifier disabled");
        }

        if (Config.CLASSIFIER_ENABLED === "bayes") {
            Logger.debug(undefined, "Initializing Bayes classifier");
            const storage = path.join(Config.LOCAL_STORAGE(), "classifier.json");

            this._bayes = await new Promise<BayesClassifier>((resolve, reject) => {
                BayesClassifier.load(storage, null, (err: Error | null, bayes: BayesClassifier | undefined) => {
                    if (err) {
                        return reject(err);
                    }

                    if (!bayes) {
                        return reject(new Error("Failed to load Bayes classifier"));
                    }

                    return resolve(bayes);
                });
            });
        }
    }

    public static async classify(req: HennosConsumer, message: string): Promise<MessageClassifications> {
        if (Config.CLASSIFIER_ENABLED === false) {
            Logger.debug(undefined, "Classifier disabled, defaulting to complex");
            return "complex";
        }

        if (Config.CLASSIFIER_ENABLED === "bayes") {
            const classification = this._bayes.getClassifications(message.toLowerCase());
            Logger.debug(undefined, `Classified message ${message} as ${classification.map((c) => `${c.label}: ${c.value}`).join(", ")}`);
            for (const classified of classification) {
                if (classified.value > 0.75) {
                    return classified.label as MessageClassifications;
                }
            }

            // If no classification is above 0.75, return complex
            Logger.debug(undefined, `Unable to confidently classify message ${message}, defaulting to complex`);
            return "complex";
        }

        if (Config.CLASSIFIER_ENABLED === "openai") {
            try {
                const user = await HennosUser.async(-1, "system");
                const response = await HennosOpenAISingleton.mini().completion(user, [{
                    role: "system",
                    type: "text",
                    content: [
                        "You are a specialized classification model that can classify messages as 'simple' or 'complex'.",
                        "Messages that are basic greetings, affirmations, thanks, or other small-talk messages should be classified as 'simple'.",
                        "Messages that are complex, require reasoning, deal with math, science, programming, or any sort of facts and knowledge should be classified as 'complex'.",
                        "You should respond only with the word 'simple' or 'complex'. ",
                    ].join(" ")
                }], [{
                    type: "text",
                    role: "user",
                    content: message
                }]);

                if (response.__type !== "string") {
                    Logger.error(req, "Error classifying message with OpenAI: ", response.__type);
                    return "complex";
                }

                Logger.debug(req, `Classified message ${message} as ${response.payload}`);
                if (response.payload === "simple") {
                    return "simple";
                }

                return "complex";

            } catch (err: unknown) {
                Logger.error(req, "Error classifying message with OpenAI: ", (err as Error).message);
                return "complex";
            }
        }

        Logger.warn(req, `Unknown classifier ${Config.CLASSIFIER_ENABLED}, defaulting to complex`);
        return "complex";
    }
}