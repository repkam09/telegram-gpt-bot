import { convertMessages } from "./ollama";

describe("Ollama", () => {
    test("should handle an ordered context of strings", () => {
        const result = convertMessages([
            {
                role: "user",
                content: "message"
            },
            {
                role: "assistant",
                content: "message"
            },
        ]);
        expect(result).toEqual([
            {
                role: "user",
                content: "message"
            },
            {
                role: "assistant",
                content: "message"
            },
        ]);
    });

    test("should handle an unordered context of strings", () => {
        const result = convertMessages([
            {
                role: "user",
                content: "message"
            },
            {
                role: "assistant",
                content: "message"
            },
            {
                role: "assistant",
                content: "message"
            },
        ]);
        expect(result).toEqual([
            {
                role: "user",
                content: "message"
            },
            {
                role: "assistant",
                content: "message"
            },
            {
                role: "assistant",
                content: "message"
            },
        ]);
    });

    test("should handle an unordered context of strings and images", () => {
        const result = convertMessages([
            {
                role: "user",
                content: "message"
            },
            {
                role: "user_image",
                images: ["image"],
                content: JSON.stringify({ mimeType: "image/jpg" })
            },
            {
                role: "assistant",
                content: "message"
            },
            {
                role: "assistant",
                content: "message"
            },
        ]);
        expect(result).toEqual([
            {
                role: "user",
                content: "message"
            },
            {
                role: "user",
                content: "",
                images: ["image"]
            },
            {
                role: "assistant",
                content: "message"
            },
            {
                role: "assistant",
                content: "message"
            },
        ]);
    });
});