import fs from "fs/promises";
import { HennosUser } from "../singletons/consumer";
import { HennosImage, HennosResponse } from "../types";
import { handlePrivateMessage } from "./text/private";
import { Logger } from "../singletons/logger";

export async function handleImageMessage(req: HennosUser, image: HennosImage, caption?: string): Promise<HennosResponse> {
    Logger.debug(req, `Processing image input: ${image.local} with ${caption ? "caption: " + caption : "no caption"}`);
    await req.updateUserChatImageContext(image);
    if (caption) {
        return handlePrivateMessage(req, caption);
    }

    return {
        __type: "empty"
    };
}

export async function loadHennosImage(image: HennosImage): Promise<string> {
    Logger.debug(undefined, `Loading image from ${image.local} Start`);
    const raw = await fs.readFile(image.local);
    const data = Buffer.from(raw).toString("base64");
    Logger.debug(undefined, `Loading image from ${image.local} Finish: ${data.length} bytes`);
    return data;
}