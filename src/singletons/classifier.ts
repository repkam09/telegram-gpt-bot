import { BayesClassifier } from "natural";
import { Logger } from "./logger";

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
        Logger.debug(`determineUserIntent input: ${input}, classified: ${result}`);
        return result;
    }
}

function train(classifier: BayesClassifier) {
    // Add some examples of image statements
    classifier.addDocument("Create an image of a fish in space", "IMAGE");
    classifier.addDocument("Draw a picture of a tree", "IMAGE");
    classifier.addDocument("Create a meme", "IMAGE");
    classifier.addDocument("Show me a cat", "IMAGE");
    classifier.addDocument("Can you create a picture of a dog?", "IMAGE");
    
    // Add some examples of text statements
    classifier.addDocument("What is the capital of France?", "TEXT");
    classifier.addDocument("What is Linux?", "TEXT");
    classifier.addDocument("Where can I find resturants nearby?", "TEXT");
    classifier.addDocument("Give me an example of something", "TEXT");
    classifier.addDocument("Write a poem about", "TEXT");
    classifier.addDocument("Summarize this paragraph", "TEXT");
    classifier.addDocument("Tell me a story", "TEXT");
    classifier.addDocument("Create an example CSV file", "TEXT");
    classifier.addDocument("Create a poem about cats", "TEXT");
    classifier.addDocument("Create a short story about cats", "TEXT");
    classifier.addDocument("Format the following document", "TEXT");
    classifier.addDocument("Simulate a conversation between two people", "TEXT");
    classifier.addDocument("What should I name my new NAS?", "TEXT");
    classifier.addDocument("Thank you", "TEXT");
    classifier.addDocument("Try again", "TEXT");
    classifier.addDocument("Repeat that, but in spanish", "TEXT");
    classifier.addDocument("In what context might I get the following error code", "TEXT");
    classifier.addDocument("Is there a file size limit for the JSONL used in fine-tuning OpenAI models?", "TEXT");
    classifier.addDocument("Describe the technical process of loading a webpage in as much detail as possible", "TEXT");

    classifier.train();
}