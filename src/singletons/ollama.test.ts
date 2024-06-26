import { convertAudioFile } from "./ollama"; // Adjust the import path as needed
import path from "node:path";

describe("convertAudioFile", () => {
    beforeAll(() => {
        process.env.HENNOS_DEVELOPMENT_MODE = "true";
        process.env.HENNOS_VERBOSE_LOGGING = "true";
    });

    const validInputPath = path.join(__dirname, "../", "../", "tests", "fixtures", "sample-audio.oga");
    const expectedOutputPath = `${validInputPath}.wav`;

    it("should convert audio file successfully", async () => {
        const result = await convertAudioFile(validInputPath);
        expect(result).toBe(expectedOutputPath);
    });
});