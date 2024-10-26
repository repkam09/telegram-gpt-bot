import { HennosConsumer, HennosImage, HennosResponse } from "../singletons/base";
import { HennosGroup } from "../singletons/group";
import { HennosUser } from "../singletons/user";
import { handlePrivateMessage } from "./text/private";

export async function handleImageMessage(req: HennosConsumer, image: HennosImage, query?: string): Promise<HennosResponse> {
    if (req instanceof HennosGroup) {
        return {
            __type: "error",
            payload: "Image processing is not supported for groups at this time."
        };
    }

    const user = req as HennosUser;

    // Add the image to the users context
    await user.updateChatContextImage("user", image);
    if (!query) {
        return {
            __type: "empty"
        };
    }

    return handlePrivateMessage(user, query);
}