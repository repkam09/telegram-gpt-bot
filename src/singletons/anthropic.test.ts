import { convertMessages } from "./anthropic";

describe("Anthropic", () => {
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
                content: [{
                    type: "text",
                    text: "message"
                }]
            },
            {
                role: "assistant",
                content: [{
                    type: "text",
                    text: "message"
                }]
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
                content: [{
                    type: "text",
                    text: "message"
                }]
            },
            {
                role: "assistant",
                content: [{
                    type: "text",
                    text: "message"
                },
                {
                    type: "text",
                    text: "message"
                }]
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
                content: [{
                    type: "text",
                    text: "message"
                },
                {
                    "type": "image",
                    source: {
                        type: "base64",
                        media_type: "image/jpg",
                        data: "image"
                    }
                }]
            },
            {
                role: "assistant",
                content: [{
                    type: "text",
                    text: "message"
                },
                {
                    type: "text",
                    text: "message"
                }]
            },
        ]);
    });
});