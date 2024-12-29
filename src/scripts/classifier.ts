import path from "node:path";
import { BayesClassifier } from "natural";
import { Config } from "../singletons/config";


export async function classifier() {
    const classifier = new BayesClassifier();

    const simple = [
        "hello",
        "hi",
        "hey",
        "good morning",
        "good afternoon",
        "good evening",
        "whats up?",
        "how are you?",
        "hello there",
        "hi there",
        "hey there",
        "good day",
        "howdy",
        "yo",
        "what's going on?",
        "how's it going?",
        "how have you been?",
        "nice to meet you",
        "pleased to meet you",
        "thanks",
        "thank you",
        "thanks a lot",
        "much appreciated",
        "no problem",
        "you're welcome",
        "anytime",
        "have a good day",
        "take care",
        "see you soon",
        "bye",
        "goodbye",
        "talk to you later",
        "catch you later",
        "greetings",
        "salutations",
        "hola",
        "aloha",
        "ciao",
        "bon voyage",

    ];

    const complex = [
        "what is the capital of France?",
        "what is the weather like today?",
        "what is the meaning of life?",
        "what is the airspeed velocity of an unladen swallow?",
        "can you tell me about the history of the Roman Empire?",
        "can you explain the theory of relativity?",
        "can you help me with my homework?",
        "can you provide me with some information?",
        "how do I solve this math problem?",
        "what is quantum physics?",
        "can you assist with debugging code?",
        "what are the benefits of exercise?",
        "how does photosynthesis work?",
        "what are the ingredients for lasagna?",
        "what's the latest news in technology?",
        "can you summarize this article for me?",
        "how old is the universe?",
        "can you calculate this equation for me?",
        "what's the history behind this tradition?",
        "what's the tallest building in the world?",
        "how can I learn a new language?",
        "what are some travel tips for Europe?",
        "what's the current stock market trend?",
        "can you explain the process of photosynthesis?",
    ];

    simple.forEach((message) => classifier.addDocument(message, "simple"));
    complex.forEach((message) => classifier.addDocument(message, "complex"));

    classifier.train();

    await new Promise<void>((resolve, reject) => {
        const storage = path.join(Config.LOCAL_STORAGE(), "classifier.json");
        classifier.save(storage, (err) => {
            if (err) {
                return reject(err);
            }

            return resolve();
        });
    });


    console.log(classifier.classify("hello"));
    console.log(classifier.classify("Can you explain the theory of relativity?"));
}

classifier();