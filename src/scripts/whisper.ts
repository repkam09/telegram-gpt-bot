import { HennosOllamaSingleton } from "../singletons/ollama";
import { HennosConsumer } from "../singletons/base";
import path from "node:path";

async function init() {
    const filepath = path.join(__dirname, "..", "..", "samples_jfk.wav");
    const result = await HennosOllamaSingleton.instance().transcription({} as HennosConsumer, filepath);

    console.log(result);
}

init();
