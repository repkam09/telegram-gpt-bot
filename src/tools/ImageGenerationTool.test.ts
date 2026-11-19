import { describe, expect, it } from "vitest";
import { detectImageMimeType } from "./ImageGenerationTool";

describe("detectImageMimeType", () => {
    it("detects PNG, JPEG and WebP from magic bytes", () => {
        expect(detectImageMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
        expect(detectImageMimeType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe("image/jpeg");
        expect(detectImageMimeType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "ascii"))).toBe("image/webp");
    });

    it("defaults to PNG for unknown data", () => {
        expect(detectImageMimeType(Buffer.from("not an image"))).toBe("image/png");
    });
});
