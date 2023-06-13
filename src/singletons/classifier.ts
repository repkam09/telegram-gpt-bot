import { BayesClassifier } from "natural";

type ChatClassification = "TEXT" | "IMAGE"

export class Classifier { 
    static _instance: BayesClassifier;
    static _models: string[];

    static instance(): BayesClassifier {
        if (!Classifier._instance) {
            Classifier._instance = new BayesClassifier();
            train(Classifier._instance);
        }

        return Classifier._instance;
    }

    static determineUserIntent(chatId: number, input: string): ChatClassification {
        const result = Classifier._instance.classify(input) as ChatClassification;
        return result;
    }
}

function train(classifier: BayesClassifier) {
    classifier.train();
}